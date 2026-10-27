from pathlib import Path
import tempfile,subprocess,socket,os
root=Path(__file__).resolve().parents[1]
def run(args,**kw):
 r=subprocess.run(args,capture_output=True,text=True,**kw)
 if r.returncode: raise RuntimeError(r.stderr+r.stdout)
 return r.stdout
with tempfile.TemporaryDirectory(prefix='dreamforge-tests-') as tmp:
 data=Path(tmp)/'pg';run(['initdb','-D',str(data),'-A','trust','-U','harness_test','--no-locale'])
 with socket.socket() as sock: sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
 run(['pg_ctl','-D',str(data),'-l',str(Path(tmp)/'pg.log'),'-o',f'-h 127.0.0.1 -p {port} -k {tmp}','-w','start'])
 try:
  cmd=['psql','-X','-h','127.0.0.1','-p',str(port),'-U','harness_test','-d','postgres','-v','ON_ERROR_STOP=1']
  run(cmd,input='create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key);')
  migrations=sorted((root/'supabase/migrations').glob('*.sql'))
  for migration in migrations:
   run(cmd+['-f',str(migration)])
  env=os.environ.copy();env['TEST_DATABASE_URL']=f'postgresql://harness_test@127.0.0.1:{port}/postgres';env['DATABASE_URL']=env['TEST_DATABASE_URL'];env['PGOPTIONS']='-c search_path=dreamforge,adorable,extensions'
  print(run(['node','--import','tsx','--test','tests/quota-safety.test.ts','tests/execution.test.ts','tests/schema-migration.test.ts','tests/payment-credit.test.ts','tests/prepaid-wallet.test.ts'],cwd=root,env=env))
 finally: run(['pg_ctl','-D',str(data),'-m','immediate','-w','stop'])
