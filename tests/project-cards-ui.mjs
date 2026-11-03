// Real project components with isolated HTTP fixtures; never changes live student projects.
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { chromium } from "playwright-core";
const root = process.cwd(),
  dir = await mkdtemp(path.join(tmpdir(), "dreamforge-project-ui-"));
await mkdir(dir + "/app/[projectId]/[conversationId]", { recursive: true });
await symlink(root + "/node_modules", dir + "/node_modules");
await writeFile(
  dir + "/package.json",
  JSON.stringify({ name: "project-ui-fixture", private: true }),
);
await writeFile(
  dir + "/next.config.mjs",
  `export default {devIndicators:false,webpack(config){config.resolve.alias['@']=${JSON.stringify(root)};return config;}};`,
);
await writeFile(
  dir + "/tsconfig.json",
  JSON.stringify({
    compilerOptions: {
      target: "ES2017",
      lib: ["dom", "esnext"],
      jsx: "preserve",
      module: "esnext",
      moduleResolution: "bundler",
      esModuleInterop: true,
      skipLibCheck: true,
      allowJs: true,
      paths: { "@/*": [root + "/*"] },
    },
  }),
);
await writeFile(
  dir + "/app/layout.tsx",
  `import '${root}/app/platform.css';export default function Layout({children}){return <html><body>{children}</body></html>}`,
);
await writeFile(dir + "/postcss.config.mjs", `export default {plugins:{"@tailwindcss/postcss":{}}}`);
await writeFile(dir + "/app/toolbar.css", `@import "${root}/app/globals.css";
@source "${root}/components/assistant-ui";`);
await mkdir(dir + "/app/toolbar", { recursive: true });
await writeFile(dir + "/app/toolbar/page.tsx", `import '../toolbar.css';import {GroupDialog} from '${root}/components/assistant-ui/group-dialog';import {ShareDialog} from '${root}/components/assistant-ui/share-dialog';export default function Page(){const project={id:'vm-toolbar',name:'Toolbar test',previewUrl:'',productionUrl:'',prodVmId:null,conversations:[],releases:[],liveReleaseId:null};return <div style={{display:'flex',alignItems:'center',gap:8,padding:20}}><GroupDialog project={project}/><ShareDialog project={project}/></div>}`);
await mkdir(dir + "/app/request-approval", { recursive: true });
await writeFile(dir + "/app/request-approval/page.tsx", `"use client";import '../toolbar.css';import {useState} from 'react';import {PromptApprovalMenu} from '${root}/components/assistant-ui/prompt-approval-menu';import {PromptApprovalActions} from '${root}/components/prompt-approval-actions';export default function Page(){const [status,setStatus]=useState(null),[eligible,setEligible]=useState(true);const id='00000000-0000-4000-8000-000000000999';return <main style={{padding:40}}><h1>Student prompt</h1><p>Blocked · not sent to the AI</p><PromptApprovalMenu approval={{id,status,eligible,used:false,can_request:eligible&&!status}} onRequest={async(id)=>{const r=await fetch('/api/platform/held-prompts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,action:'request',projectId:'vm-fixture',conversationId:'00000000-0000-4000-8000-000000000998'})});if(!r.ok)throw Error('Request failed');setStatus('pending');}}/><h2>Teacher queue</h2>{status==='pending'?<PromptApprovalActions reviewId={id} classrooms={[{id:'00000000-0000-4000-8000-000000000111',name:'Classroom'}]} onDecided={()=>setStatus('approved')}/>:<p>No requests waiting.</p>}<label><input type='checkbox' checked={eligible} onChange={e=>setEligible(e.target.checked)}/>Student belongs to a classroom</label></main>}`);
await mkdir(dir + "/app/approval-conversation", { recursive: true });
await writeFile(dir + "/app/approval-conversation/page.tsx", `"use client";import '../toolbar.css';import {useEffect,useState} from 'react';import {Assistant} from '${root}/app/assistant';import {ModelSettingsProvider} from '${root}/components/assistant-ui/model-settings';import {TooltipProvider} from '${root}/components/ui/tooltip';import {PromptApprovalActions} from '${root}/components/prompt-approval-actions';const reviewId='00000000-0000-4000-8000-000000000999',conversationId='00000000-0000-4000-8000-000000000998';const initial=[{id:'blocked-user',role:'user',parts:[{type:'text',text:'A fictional spooky maze'}],metadata:{custom:{blocked:true,reviewId}}},{id:'blocked-answer',role:'assistant',parts:[{type:'text',text:'This request was blocked.'}]}];export default function Page(){const [pending,setPending]=useState(false);useEffect(()=>{let stopped=false;const timer=setInterval(()=>{fetch('/api/platform/held-prompts?projectId=vm-fixture&conversationId='+conversationId).then(r=>r.json()).then(d=>{if(!stopped)setPending(d.holds.some(h=>h.status==='pending'));});},500);return()=>{stopped=true;clearInterval(timer);};},[]);return <TooltipProvider><ModelSettingsProvider><section style={{padding:20}}><h1>Teacher queue</h1>{pending?<PromptApprovalActions reviewId={reviewId} classrooms={[{id:'00000000-0000-4000-8000-000000000111',name:'Classroom'}]} onDecided={()=>setPending(false)}/>:<p>No requests waiting.</p>}</section><section style={{display:'flex',height:650,padding:20}}><Assistant selectedProjectId='vm-fixture' selectedConversationId={conversationId} initialMessages={initial}/></section></ModelSettingsProvider></TooltipProvider>}`);
const classId = "00000000-0000-4000-8000-000000000111",
  groupId = "00000000-0000-4000-8000-000000000112";
const fixture = {
  user: { id: "student", display_name: "Student", role: "child" },
  classes: [],
  projects: [
    {
      vm_id: "vm-card",
      owner_id: "student",
      metadata: {
        name: "My game",
        description: "A puzzle adventure",
        conversations: [{ id: "conversation" }],
      },
      assigned_classrooms: [],
      is_group_project: false,
      can_make_group: false,
    },
  ],
  children: [],
  wallet: null,
  unconfirmed: [],
  projectUsage: [],
  paymentsEnabled: false,
};
const classroomFixture = {
  classroom: {
    name: "Creative classroom",
    teacher_name: "Alex",
    teacher_id: "teacher",
    invite_code: "CLASS123",
  },
  teachers: [{ id: "teacher", display_name: "Alex", is_owner: true }],
  groups: [
    { id: groupId, name: "Foxes" },
    { id: "owls", name: "Owls" },
    { id: "otters", name: "Otters" },
  ],
  myGroups: [{ id: groupId, name: "Foxes" }],
  students: [
    { id: "student", display_name: "Student", group_id: groupId },
    { id: "peer", display_name: "Mia", group_id: groupId },
    { id: "other", display_name: "Kai", group_id: "owls" },
  ],
  projects: [
    {
      vm_id: "vm-card",
      owner_id: "student",
      owner_name: "Student",
      name: "Classroom game",
      description: "Keep this description",
      is_group_project: false,
      conversation_id: "conversation",
    },
    {
      vm_id: "vm-peer",
      owner_id: "peer",
      owner_name: "Mia",
      name: "Mia's game",
      group_name: "Foxes",
      is_group_project: true,
      can_collaborate: true,
      conversation_id: "peer-conversation",
    },
  ],
  availableProjects: [],
};
await mkdir(dir + "/app/classroom", { recursive: true });
await mkdir(dir + "/app/teacher-classroom", { recursive: true });
await writeFile(
  dir + "/app/teacher-classroom/page.tsx",
  `import {ClassroomGroups} from '${root}/components/classroom-groups';import {AddPersonDialog} from '${root}/components/people-toolbar';export default function Page(){return <><AddPersonDialog role="teacher" classroom={{id:"${classId}",name:"Creative classroom"}}/><ClassroomGroups classId="${classId}"/></>}`,
);
await writeFile(
  dir + "/app/classroom/page.tsx",
  `import {StudentClassroomDetail} from '${root}/components/student-classroom-detail';export default function Page(){return <StudentClassroomDetail classId="${classId}" user={{id:"student",display_name:"Student"}} initialData={${JSON.stringify(classroomFixture)}}/>}`,
);
await writeFile(
  dir + "/app/page.tsx",
  `import {PlatformDashboard} from '${root}/components/platform-dashboard';export default function Page(){return <PlatformDashboard initialSection="projects" initialData={${JSON.stringify(fixture)}}/>}`,
);
await writeFile(
  dir + "/app/[projectId]/[conversationId]/page.tsx",
  `export default function Page(){return <h1>Project workspace</h1>}`,
);
const reservation = createServer();
await new Promise((r) => reservation.listen(0, "127.0.0.1", r));
const port = reservation.address().port;
await new Promise((r) => reservation.close(r));
let logs = "";
const child = spawn(
  process.execPath,
  [
    root + "/node_modules/next/dist/bin/next",
    "dev",
    "--webpack",
    "--hostname",
    "127.0.0.1",
    "--port",
    String(port),
  ],
  {
    cwd: dir,
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      NEXT_TELEMETRY_DISABLED: "1",
    },
  },
);
child.stdout.on("data", (b) => (logs += b));
child.stderr.on("data", (b) => (logs += b));
let browser, page;
try {
  const origin = `http://127.0.0.1:${port}`;
  let ready = false;
  for (let n = 0; n < 60; n++) {
    try {
      if ((await fetch(origin, { signal: AbortSignal.timeout(10000) })).ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  assert(ready, logs.slice(-10000));
  browser = await chromium.launch({
    executablePath:
      process.env.TEST_BROWSER_EXECUTABLE ||
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: true,
  });
  const context = await browser.newContext();
  page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.setDefaultNavigationTimeout(20000);
  const data = structuredClone(fixture);
  let releaseClassrooms;
  let classroomGate = new Promise((resolve) => (releaseClassrooms = resolve));
  const mutations = [];
  const classroom = structuredClone(classroomFixture);
  await context.route("**/api/**", (route) =>
    route.fulfill({
      status: 404,
      json: { error: "Unexpected fixture request" },
    }),
  );
  await context.route(`**/api/platform/classes/${classId}`, (route) =>
    route.fulfill({ json: classroom }),
  );
  await context.route("**/api/platform/dashboard", (route) =>
    route.fulfill({ json: data }),
  );
  await context.route("**/api/projects/vm-card", async (route) => {
    assert.equal(route.request().method(), "PATCH");
    const body = route.request().postDataJSON();
    mutations.push(body);
    Object.assign(data.projects[0].metadata, body);
    await route.fulfill({
      json: { name: body.name, description: body.description },
    });
  });
  await context.route("**/api/projects/vm-card/classrooms", async (route) => {
    if (route.request().method() === "PUT") {
      const ids = route.request().postDataJSON().classIds;
      data.projects[0].assigned_classrooms = ids.map((id) => ({
        id,
        name: "Creative classroom",
      }));
      data.projects[0].can_make_group = ids.length > 0;
      await route.fulfill({ json: { ok: true } });
      return;
    }
    await classroomGate;
    await route.fulfill({
      json: {
        classes: [
          {
            id: classId,
            name: "Creative classroom",
            attached: !!data.projects[0].assigned_classrooms.length,
          },
        ],
        groups: [{ id: groupId, name: "Foxes", class_id: classId }],
      },
    });
  });
  await context.route(
    `**/api/platform/classes/${classId}/groups`,
    async (route) => {
      if (route.request().method() === "GET") {
        return route.fulfill({ json: {
          groups: classroom.groups.map((g) => ({...g, category: "Nature & Animals"})),
          students: classroom.students.map((s) => ({...s, username: s.display_name.toLowerCase(), alert_count: 0, pending_count: 0})),
          projects: [],
          classroomProjects: [],
        }});
      }
      const body = route.request().postDataJSON();
      assert.equal(body.projectId, "vm-card");
      assert.equal(body.groupId, groupId);
      Object.assign(classroom.projects[0], {
        is_group_project: true,
        classroom_group_id: groupId,
        group_name: "Foxes",
      });
      Object.assign(data.projects[0], {
        is_group_project: true,
        group_name: "Foxes",
      });
      await route.fulfill({ json: { ok: true } });
    },
  );
  const sharedTeacher = { id: "shared-teacher", username: "stacey_teacher", display_name: "Stacey Lee" };
  let teacherAdded = false;
  await context.route("**/api/platform/people", async (route) => {
    const body = route.request().postDataJSON();
    assert.equal(body.role, "teacher");
    assert.equal(body.classId, classId);
    if (body.action === "search") {
      assert.equal(body.identifier, "stacey");
      return route.fulfill({ json: { people: [sharedTeacher] } });
    }
    assert.equal(body.action, "add");
    assert.equal(body.identifier, "stacey_teacher");
    teacherAdded = true;
    return route.fulfill({ json: { person: sharedTeacher } });
  });
  let markedGroupProject = false;
  await context.route("**/api/projects/vm-toolbar/group", route => route.fulfill({json: {
    visible: markedGroupProject,
    isGroupProject: markedGroupProject,
    you: "student",ownerId: "student",ownerName: "Student",editorId: "student",
    members: [],candidates: [],canManage: false,canPass: true,
  }}));
  let approvalRequested=false,teacherDecided=false;
  await context.route('**/api/platform/held-prompts',async route=>{
    const body=route.request().postDataJSON();assert.equal(body.action,'request');assert.equal(body.id,'00000000-0000-4000-8000-000000000999');approvalRequested=true;return route.fulfill({json:{ok:true,status:'pending'}});
  });
  await context.route('**/api/platform/reviews',async route=>{
    assert.equal(approvalRequested,true);const body=route.request().postDataJSON();assert.equal(body.action,'approve');teacherDecided=true;return route.fulfill({json:{ok:true}});
  });
  await page.goto(origin);
  await page.getByRole("heading", { name: "Projects", exact: true }).waitFor();
  assert.equal(
    await page
      .getByText("Not assigned to a classroom", { exact: true })
      .count(),
    0,
  );
  const menu = () => page.locator('summary[aria-label^="Actions for"]');
  await menu().click();
  assert.equal(
    await page
      .getByRole("button", { name: "Make group project", exact: true })
      .count(),
    0,
  );
  await page.getByRole("heading", { name: "Projects", exact: true }).click();
  assert.equal(await page.locator("details[open]").count(), 0);
  await menu().click();
  await page
    .getByRole("button", { name: "Assign to classroom", exact: true })
    .click();
  await page.getByRole("button", { name: "Loading…", exact: true }).waitFor();
  assert.equal(await page.getByRole("dialog").count(), 0);
  releaseClassrooms();
  await page.getByRole("checkbox", { name: "Creative classroom" }).waitFor();
  assert.equal(await page.getByRole("dialog").getByRole("status").count(), 0);
  await page.getByRole("checkbox", { name: "Creative classroom" }).check();
  await page.getByRole("button", { name: "Save sharing", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page.getByText("Creative classroom", { exact: true }).waitFor();
  console.log(
    "PASS project menu closes outside, hides ineligible group action, and opens classroom modal only after loading",
  );
  await page.getByRole("heading", { name: "Projects", exact: true }).click();
  await menu().click();
  await page
    .getByRole("button", { name: "Rename project", exact: true })
    .click();
  assert.equal(
    await page.getByLabel("Description (optional)").inputValue(),
    "A puzzle adventure",
  );
  await page.getByLabel("Project name", { exact: true }).fill("Renamed game");
  await page.getByLabel("Description (optional)").fill("A new description");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page
    .getByRole("heading", { name: "Renamed game", exact: true })
    .waitFor();
  await page.getByText("A new description", { exact: true }).waitFor();
  assert.deepEqual(mutations, [
    { name: "Renamed game", description: "A new description" },
  ]);
  await page.getByRole("heading", { name: "Projects", exact: true }).click();
  await menu().click();
  await page
    .getByRole("button", { name: "Rename project", exact: true })
    .click();
  await page.getByRole("dialog").waitFor();
  // Wait for the dialog's focus/dismissal effects, then click outside normally.
  await page.waitForFunction(() => {
    const input = document.querySelector('[role="dialog"] input');
    return input && document.activeElement === input;
  });
  await page.mouse.click(1, 1);
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  console.log(
    "PASS project name and description save together and dialogs dismiss outside",
  );
  await menu().click();
  await page
    .getByRole("button", { name: "Make group project", exact: true })
    .click();
  await page
    .getByLabel("Classroom and group", { exact: true })
    .selectOption(groupId);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Make group project", exact: true })
    .click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page.getByText("Group project · Foxes", { exact: true }).waitFor();
  await page.getByRole("heading", { name: "Projects", exact: true }).click();
  await page.getByRole("article").click();
  await page.waitForURL(origin + "/vm-card/conversation");
  await page.getByRole("heading", { name: "Project workspace" }).waitFor();
  console.log(
    "PASS assigned group action refreshes project type; card body navigates without a footer link",
  );
  await page.goto(origin + "/classroom");
  await page
    .getByRole("heading", { name: "Creative classroom", exact: true })
    .waitFor();
  assert.equal(
    await page
      .getByText("Share projects with your group", { exact: true })
      .count(),
    0,
  );
  for (const name of ["Foxes", "Owls", "Otters"])
    await page
      .getByRole("article", { name: `${name} group`, exact: true })
      .waitFor();
  await page
    .getByRole("article", { name: "Foxes group" })
    .getByText("Your group", { exact: true })
    .waitFor();
  assert.equal(await page.locator('[draggable="true"]').count(), 0);
  assert.equal(
    await page
      .getByRole("button", {
        name: /Rename Group|Remove Group|Create groups|Add group/,
      })
      .count(),
    0,
  );
  assert.equal(
    await page
      .getByRole("combobox", { name: /Assign group|Move to group/ })
      .count(),
    0,
  );
  assert.equal(
    await page.locator('summary[aria-label^="Actions for"]').count(),
    1,
  );
  assert.equal(await page.getByRole("link", { name: "Open project", exact: true }).count(), 0);
  assert.equal(await page.getByRole("button", { name: "View project", exact: true }).count(), 0);
  const classroomUrl = page.url();
  const actions = page.locator('summary[aria-label="Actions for Classroom game"]');
  assert(await actions.evaluate((el) => {
    const cell = el.closest("td").getBoundingClientRect();
    const menu = el.getBoundingClientRect();
    return cell.right - menu.right < 40;
  }), "Project menu should align with the right edge of the row");
  await page
    .locator('summary[aria-label="Actions for Classroom game"]')
    .click();
  const makeGroup = page.getByRole("button", {
    name: "Make group project",
    exact: true,
  });
  await makeGroup.waitFor();
  assert.equal(page.url(), classroomUrl, "Menu click must not navigate the row");
  assert(
    await makeGroup.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return el.contains(
        document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2),
      );
    }),
    "Table must not clip the action menu",
  );
  const screenshots = path.join(root, ".e2e-results/student-classroom");
  await mkdir(screenshots, { recursive: true });
  await page.screenshot({
    path: path.join(screenshots, "project-menu.png"),
    fullPage: true,
  });
  await makeGroup.click();
  const dialog = page.getByRole("dialog");
  const groups = dialog.getByRole("combobox", {
    name: "Classroom and group",
    exact: true,
  });
  await groups.selectOption(groupId);
  assert.equal(
    await groups.locator("option").count(),
    2,
    "Only the student's own group should be offered",
  );
  await dialog
    .getByRole("button", { name: "Make group project", exact: true })
    .click();
  await dialog.waitFor({ state: "hidden" });
  const projectRow = page
    .getByRole("row")
    .filter({ hasText: "Classroom game" });
  await projectRow.getByText("Foxes", { exact: true }).waitFor();
  await page.screenshot({
    path: path.join(screenshots, "classroom-groups.png"),
    fullPage: true,
  });
  await projectRow.getByText("Classroom game", { exact: true }).click();
  await page.waitForURL("**/vm-card/conversation");
  await page.goto(origin + "/teacher-classroom");
  const groupHeading = page.getByRole("heading", { name: "Foxes", exact: true });
  await groupHeading.waitFor();
  await groupHeading.click();
  await page.locator(".df-group-avatar-student").getByText("Student", { exact: true }).click();
  assert.equal(page.url(), origin + "/teacher-classroom");
  assert.equal(await page.locator('.df-group-avatar-student a, .df-group-avatar-student button').count(), 0);
  assert.equal(await page.locator('.df-group-avatar-button[draggable="true"]').count(), 3);
  await page.locator('summary[aria-label="Actions for Foxes"]').click();
  await page.getByRole("button", { name: "Rename Group", exact: true }).first().waitFor();
  await page.getByRole("heading", { name: "Projects", exact: true }).waitFor();
  console.log("PASS classroom group and student clicks are inert while teacher drag-and-drop and group menus remain available");
  await page.getByRole("button", { name: "Add teacher", exact: true }).click();
  await page.getByRole("combobox", { name: "Username or email", exact: true }).fill("stacey");
  const teacherMatch = page.getByRole("option", { name: /Stacey Lee.*stacey_teacher/ });
  await teacherMatch.waitFor();
  assert.equal(await teacherMatch.isEnabled(), true);
  await teacherMatch.click();
  await page.getByRole("button", { name: "Add to classroom", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  assert.equal(teacherAdded, true);
  console.log("PASS teacher lookup offers a teacher from another school and allows classroom assignment");
  await page.goto(classroomUrl);
  const keyboardRow = page.getByRole("row", { name: "Open Classroom game", exact: true });
  await keyboardRow.focus();
  await keyboardRow.press("Enter");
  await page.waitForURL("**/vm-card/conversation");
  const individualResponse = page.waitForResponse(r=>r.url().endsWith('/api/projects/vm-toolbar/group'));
  await page.goto(origin + '/toolbar');
  await individualResponse;
  await page.getByRole('button',{name:'Share',exact:true}).waitFor();
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  assert.equal(await page.getByRole('button',{name:'Group',exact:true}).count(),0);
  markedGroupProject=true;
  await page.reload();
  const groupButton=page.getByRole('button',{name:'Group',exact:true});
  await groupButton.waitFor();
  const groupBox=await groupButton.boundingBox(),shareBox=await page.getByRole('button',{name:'Share',exact:true}).boundingBox();
  assert.equal(groupBox.height,28);
  assert.equal(groupBox.height,shareBox.height);
  await groupButton.click();
  await page.getByRole('dialog').getByText('Editing',{exact:true}).waitFor();
  console.log('PASS individual projects hide Group; marked group projects show Group with the same 28px height as Share');
  await page.goto(origin+'/request-approval');
  assert.equal(await page.getByRole('button',{name:'Approve',exact:true}).count(),0);
  await page.getByLabel('Prompt actions',{exact:true}).click();
  await page.getByRole('menuitem',{name:'Ask for approval',exact:true}).click();
  await page.getByRole('button',{name:'Approve',exact:true}).waitFor();
  assert.equal(approvalRequested,true);
  await page.getByLabel('Prompt actions',{exact:true}).click();
  assert.equal(await page.getByRole('menuitem',{name:'Awaiting teacher approval',exact:true}).isDisabled(),true);
  await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'Approve',exact:true}).click();
  assert.equal(teacherDecided,true);
  await page.getByLabel('Prompt actions',{exact:true}).click();
  assert.equal(await page.getByRole('menuitem',{name:'Approved by teacher',exact:true}).isDisabled(),true);
  await page.keyboard.press('Escape');
  await page.getByRole('checkbox',{name:'Student belongs to a classroom'}).uncheck();
  assert.equal(await page.getByLabel('Prompt actions',{exact:true}).count(),0);
  console.log('PASS approval menu requires a student request, prevents repeats, enables the teacher decision and hides outside a classroom');
  let requestedStatus=null, resumedCalls=0;
  const requestId='00000000-0000-4000-8000-000000000999';
  await context.route('**/api/models',route=>route.fulfill({json:{models:[]}}));
  await context.route('**/api/projects/vm-fixture/execution*',route=>route.fulfill({json:{revision:0,activeRun:null}}));
  await context.route('**/api/platform/held-prompts*',async route=>{
    if(route.request().method()==='POST'){
      const body=route.request().postDataJSON();assert.equal(body.action,'request');assert.equal(body.id,requestId);requestedStatus='pending';return route.fulfill({json:{ok:true,status:'pending'}});
    }
    const row={id:requestId,content:'A fictional spooky maze',status:requestedStatus,can_request:!requestedStatus,eligible:true,used:false};
    return route.fulfill({json:{prompts:[row],holds:requestedStatus?[row]:[]}});
  });
  await context.route('**/api/platform/reviews',async route=>{assert.equal(requestedStatus,'pending');requestedStatus='approved';return route.fulfill({json:{ok:true}});});
  await context.route('**/api/chat',async route=>{
    const body=route.request().postDataJSON();assert.equal(requestedStatus,'approved');assert.equal(body.projectId,'vm-fixture');assert.equal(body.messages.at(-1).parts[0].text,'A fictional spooky maze');resumedCalls++;
    const events=[{type:'start',messageId:'continued-answer'},{type:'text-start',id:'text'},{type:'text-delta',id:'text',delta:'APPROVAL_FIXTURE_CONTINUED'},{type:'text-end',id:'text'},{type:'finish',finishReason:'stop'}];
    return route.fulfill({contentType:'text/event-stream',headers:{'x-vercel-ai-ui-message-stream':'v1'},body:events.map(e=>'data: '+JSON.stringify(e)+'\n\n').join('')+'data: [DONE]\n\n'});
  });
  await page.goto(origin+'/approval-conversation');
  await page.getByLabel('Prompt actions',{exact:true}).waitFor();
  assert.equal(resumedCalls,0);
  assert.equal(await page.getByRole('button',{name:'Approve',exact:true}).count(),0);
  await page.getByLabel('Prompt actions',{exact:true}).click();
  await page.getByRole('menuitem',{name:'Ask for approval',exact:true}).click();
  await page.getByRole('button',{name:'Approve',exact:true}).waitFor();
  assert.equal(resumedCalls,0);
  await page.getByRole('button',{name:'Approve',exact:true}).click();
  await page.getByText('APPROVAL_FIXTURE_CONTINUED',{exact:true}).waitFor({timeout:20000});
  await page.waitForTimeout(5500);
  assert.equal(resumedCalls,1,'Repeated approval polling must not send the prompt twice');
  console.log('PASS the real Assistant resumes the exact requested prompt once after a teacher decision');
  console.log(
    "PASS student classroom uses a visible row menu, shows read-only groups and shares only the owner's project with their assigned group",
  );
} catch (error) {
  if (page)
    console.error("Fixture failure:", await page.locator("body").innerText());
  throw error;
} finally {
  if (browser) await browser.close();
  child.kill("SIGTERM");
  await new Promise((r) => child.once("exit", r));
  await rm(dir, { recursive: true, force: true });
}
