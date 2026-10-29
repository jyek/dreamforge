from pathlib import Path
import tempfile
import subprocess
import socket
import os

root = Path(__file__).resolve().parents[1]


def run(args, **kwargs):
    result = subprocess.run(args, capture_output=True, text=True, timeout=60, **kwargs)
    if result.returncode:
        raise RuntimeError(result.stderr + result.stdout)
    return result.stdout


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
        cmd = ['psql', '-X', '-h', '127.0.0.1', '-p', str(port), '-U',
               'harness_test', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1']
        run(cmd, input='create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key);')
        for migration in sorted((root / 'supabase/migrations').glob('*.sql')):
            print(f'Database fixture: apply {migration.name}', flush=True)
            run(cmd + ['-f', str(migration)])
        env = os.environ.copy()
        env['TEST_DATABASE_URL'] = f'postgresql://harness_test@127.0.0.1:{port}/postgres'
        env['DATABASE_URL'] = env['TEST_DATABASE_URL']
        env['PGOPTIONS'] = '-c search_path=dreamforge,adorable,extensions'
        print('Database tests: streaming test results', flush=True)
        # Inherit stdout so CI exposes the last test reached instead of buffering
        # every result until all test files exit. Bound both tests and subprocess.
        subprocess.run([
            'node', '--import', 'tsx', '--test', '--test-timeout=120000',
            'tests/quota-safety.test.ts', 'tests/execution.test.ts',
            'tests/schema-migration.test.ts', 'tests/payment-credit.test.ts',
            'tests/prepaid-wallet.test.ts', 'tests/admin-showcase.test.ts',
        ], cwd=root, env=env, timeout=300, check=True)
    finally:
        print('Database fixture: stop PostgreSQL', flush=True)
        run(['pg_ctl', '-D', str(data), '-m', 'immediate', '-w', 'stop'])
