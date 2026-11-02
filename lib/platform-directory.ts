type Db = {
  query: (sql: string, values: unknown[]) => Promise<{ rows: any[] }>;
};
/** Call only after platform-admin authorization. No credentials or prompt content. */
export async function platformDirectory(db: Db) {
  const people = (
    await db.query(
      `select p.id,p.display_name as name,p.username,p.role,p.school_id,case when p.role='teacher' then (select string_agg(sch.name,', ' order by sch.name) from school_teachers st join schools sch on sch.id=st.school_id where st.teacher_id=p.id) else s.name end as school,
    exists(select 1 from school_admins a where a.profile_id=p.id) as school_admin,
    coalesce((select string_agg(c.name,', ' order by c.name) from classes c where c.teacher_id=p.id or exists(select 1 from class_teachers t where t.class_id=c.id and t.teacher_id=p.id) or exists(select 1 from class_members m where m.class_id=c.id and m.child_id=p.id)),'') as classrooms
    from profiles p left join schools s on s.id=p.school_id order by p.display_name`,
      [],
    )
  ).rows;
  const classrooms = (
    await db.query(
      `select c.id,c.name,c.school_id,s.name as school,
    (select string_agg(t.display_name,', ' order by t.display_name) from profiles t where t.id=c.teacher_id or exists(select 1 from class_teachers ct where ct.class_id=c.id and ct.teacher_id=t.id)) as teachers,
    coalesce((select string_agg(t.display_name,', ' order by t.display_name) from class_members m join profiles t on t.id=m.child_id where m.class_id=c.id),'') as students
    from classes c join profiles p on p.id=c.teacher_id left join schools s on s.id=c.school_id order by c.name`,
      [],
    )
  ).rows;
  const groups = (
    await db.query(
      `select p.vm_id as id,coalesce(p.metadata->>'name',p.vm_id) as name,owner.school_id,s.name as school,owner.display_name as owner,
    coalesce(editor.display_name,owner.display_name) as editor,
    (select string_agg(member.display_name,', ' order by member.display_name) from profiles member where member.id=p.owner_id or exists(select 1 from project_members pm where pm.vm_id=p.vm_id and pm.child_id=member.id)) as members
    from projects p join profiles owner on owner.id=p.owner_id left join profiles editor on editor.id=p.editor_id
    left join schools s on s.id=owner.school_id where exists(select 1 from project_members pm where pm.vm_id=p.vm_id) order by name`,
      [],
    )
  ).rows;
  return {
    teachers: people.filter((p) => p.role === "teacher"),
    students: people.filter((p) => p.role === "child"),
    classrooms,
    groups,
  };
}
