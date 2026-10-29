from pathlib import Path
import tempfile
import subprocess
import socket
import os
from contextlib import contextmanager
from urllib.parse import urlparse, urlunparse
from uuid import uuid4

root = Path(__file__).resolve().parents[1]


def run(args, **kwargs):
    result = subprocess.run(args, capture_output=True, text=True, timeout=60, **kwargs)
    if result.returncode:
        raise RuntimeError(result.stderr + result.stdout)
    return result.stdout


@contextmanager
def database_fixture():
    existing = os.environ.get('TEST_PG_ADMIN_URL')
    if existing:
        url = urlparse(existing)
        if url.scheme not in ('postgres', 'postgresql') or url.hostname not in ('localhost', '127.0.0.1', '::1') or url.query or url.fragment:
            raise RuntimeError('TEST_PG_ADMIN_URL must point to an explicitly chosen local PostgreSQL server')
        # Opt-in fallback for Macs unable to allocate another cluster. Only a fresh
        # randomly named database is migrated; existing databases are never used.
        name = 'dreamforge_test_' + uuid4().hex
        cmd = ['psql', '-X', existing, '-v', 'ON_ERROR_STOP=1']
        roles = run(cmd + ['-Atc', "select count(*) from pg_roles where rolname in ('anon','authenticated')"]).strip()
        if roles != '2':
            raise RuntimeError('The local fixture server needs anon and authenticated roles')
        run(cmd + ['-c', f'create database "{name}"'])
        try:
            yield urlunparse(url._replace(path='/' + name))
        finally:
            print('Database fixture: remove isolated database', flush=True)
            run(cmd + ['-c', f'drop database "{name}" with (force)'])
        return
    with tempfile.TemporaryDirectory(prefix='dreamforge-tests-') as tmp:
        data = Path(tmp) / 'pg'
        print('Database fixture: initialize isolated PostgreSQL cluster', flush=True)
        run(['initdb', '-D', str(data), '-A', 'trust', '-U', 'harness_test', '--no-locale'])
        with socket.socket() as sock:
            sock.bind(('127.0.0.1', 0))
            port = sock.getsockname()[1]
        run(['pg_ctl', '-D', str(data), '-l', str(Path(tmp) / 'pg.log'), '-o',
             f'-h 127.0.0.1 -p {port} -k {tmp}', '-w', 'start'])
        try:
            uri = f'postgresql://harness_test@127.0.0.1:{port}/postgres'
            run(['psql', '-X', uri, '-v', 'ON_ERROR_STOP=1', '-c', 'create role anon; create role authenticated;'])
            yield uri
        finally:
            print('Database fixture: stop PostgreSQL', flush=True)
            run(['pg_ctl', '-D', str(data), '-m', 'immediate', '-w', 'stop'])


with database_fixture() as uri:
    cmd = ['psql', '-X', uri, '-v', 'ON_ERROR_STOP=1']
    run(cmd, input='create schema auth; create table auth.users(id uuid primary key);')
    for migration in sorted((root / 'supabase/migrations').glob('*.sql')):
        print(f'Database fixture: apply {migration.name}', flush=True)
        run(cmd + ['-f', str(migration)])
    env = os.environ.copy()
    env['TEST_DATABASE_URL'] = uri
    env['PGOPTIONS'] = '-c search_path=dreamforge,adorable,extensions'
    print('Database tests: streaming test results', flush=True)
    subprocess.run(['node', 'scripts/run-test-suite.mjs', 'database'],
                   cwd=root, env=env, timeout=300, check=True)
