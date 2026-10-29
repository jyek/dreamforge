begin;
set local lock_timeout='5s';
alter table dreamforge.projects add column is_showcased boolean not null default false;
update dreamforge.projects set is_showcased=is_example;
-- Keep the gallery selection, but link copied personal examples back to their live originals.
update dreamforge.projects source set is_showcased=true,
 metadata=source.metadata||jsonb_build_object('exampleOrder',copy.metadata->>'exampleOrder','description',coalesce(copy.metadata->>'description',''))
 from dreamforge.projects copy
 where copy.is_showcased and copy.metadata->>'showcaseSourceId'=source.vm_id;
update dreamforge.projects copy set is_showcased=false
 where copy.metadata->>'showcaseSourceId' is not null
 and exists(select 1 from dreamforge.projects source where source.vm_id=copy.metadata->>'showcaseSourceId');
-- Ownership, editing permissions, conversations and old example copies are preserved.
commit;
