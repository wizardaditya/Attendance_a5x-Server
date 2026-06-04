import nodemailer from 'nodemailer';

// ── Transporter setup — recreated fresh every call so env vars are always read ──
function getTransporter() {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.warn('⚠️  Email not configured - EMAIL_USER or EMAIL_PASS missing');
    return null;
  }
  return nodemailer.createTransport({
    host:   'smtp.gmail.com',
    port:   587,
    secure: false, // STARTTLS — works on Render free tier
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
    tls: {
      rejectUnauthorized: false,
    },
    connectionTimeout: 15000,
    greetingTimeout:   10000,
    socketTimeout:     20000,
  });
}

const COMPANY  = process.env.COMPANY_NAME || 'A5X Industries';
const APP_NAME = 'WorkSyne';
const ACCENT   = '#39ff14';

// ── Base HTML template ───────────────────────────────────────────────────────
function baseTemplate(title, bodyHtml) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:'Segoe UI',Arial,sans-serif;color:#f0f0f0;">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table width="100%" style="max-width:560px;background:#111;border-radius:16px;border:1px solid #1f1f1f;overflow:hidden;">
          <!-- Header -->
          <tr>
            <td style="background:#0d0d0d;padding:20px 28px;border-bottom:2px solid ${ACCENT};">
              <span style="font-size:22px;font-weight:800;color:#fff;letter-spacing:-0.5px;">
                WORK<span style="color:${ACCENT}">SYNE</span>
              </span>
              <span style="float:right;font-size:11px;color:#6b7280;line-height:28px;">${COMPANY}</span>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:28px;">
              ${bodyHtml}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:16px 28px;background:#0d0d0d;border-top:1px solid #1a1a1a;font-size:11px;color:#4b5563;text-align:center;">
              This is an automated message from ${APP_NAME} · ${COMPANY}<br/>
              Please do not reply to this email.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ── Generic send helper ──────────────────────────────────────────────────────
async function sendMail({ to, subject, html }) {
  const t = getTransporter();
  if (!t) return; // email not configured, skip silently

  const recipients = Array.isArray(to) ? to.join(',') : to;
  if (!recipients) return;

  try {
    await t.sendMail({
      from:    `"${APP_NAME} · ${COMPANY}" <${process.env.EMAIL_USER}>`,
      to:      recipients,
      subject: `[${APP_NAME}] ${subject}`,
      html,
    });
    console.log(`📧 Email sent: "${subject}" → ${recipients}`);
  } catch (err) {
    console.error('📧 Email send failed:', err.message);
  }
}

// ════════════════════════════════════════════════════════════════════════════
// EMAIL TEMPLATES
// ════════════════════════════════════════════════════════════════════════════

// 1. New Announcement
export async function sendAnnouncementEmail({ title, body, priority, createdByName, recipients }) {
  const priorityColor = priority === 'URGENT' ? '#f87171' : priority === 'HIGH' ? '#fb923c' : ACCENT;
  const html = baseTemplate(`New Announcement: ${title}`, `
    <h2 style="font-size:18px;font-weight:700;color:#fff;margin:0 0 6px;">${title}</h2>
    <span style="display:inline-block;background:${priorityColor}20;color:${priorityColor};font-size:11px;font-weight:600;padding:3px 10px;border-radius:999px;border:1px solid ${priorityColor}44;margin-bottom:16px;">
      📢 ${priority || 'GENERAL'}
    </span>
    <p style="font-size:14px;color:#d1d5db;line-height:1.6;margin:0 0 20px;">${body}</p>
    <p style="font-size:12px;color:#6b7280;margin:0;">Posted by <strong style="color:#9ca3af">${createdByName}</strong></p>
  `);
  await sendMail({ to: recipients, subject: `New Announcement: ${title}`, html });
}

// 2. New Task Assigned
export async function sendTaskAssignedEmail({ taskTitle, description, priority, dueDate, assignedByName, recipient }) {
  const due = dueDate ? new Date(dueDate).toLocaleDateString('en-IN', { day:'numeric', month:'long', year:'numeric' }) : 'No due date';
  const priColor = { URGENT:'#f87171', HIGH:'#fb923c', MEDIUM:'#f5e642', LOW:ACCENT }[priority] || ACCENT;
  const html = baseTemplate(`New Task: ${taskTitle}`, `
    <h2 style="font-size:18px;font-weight:700;color:#fff;margin:0 0 6px;">${taskTitle}</h2>
    <span style="display:inline-block;background:${priColor}20;color:${priColor};font-size:11px;font-weight:600;padding:3px 10px;border-radius:999px;border:1px solid ${priColor}44;margin-bottom:16px;">
      ${priority}
    </span>
    ${description ? `<p style="font-size:14px;color:#d1d5db;line-height:1.6;margin:0 0 16px;">${description}</p>` : ''}
    <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
      <tr>
        <td style="padding:8px 12px;background:#0a0a0a;border-radius:8px 0 0 8px;font-size:12px;color:#6b7280;width:40%;">Assigned by</td>
        <td style="padding:8px 12px;background:#0a0a0a;font-size:13px;color:#fff;font-weight:600;">${assignedByName}</td>
      </tr>
      <tr><td colspan="2" style="height:4px;"></td></tr>
      <tr>
        <td style="padding:8px 12px;background:#0a0a0a;border-radius:8px 0 0 8px;font-size:12px;color:#6b7280;">Due Date</td>
        <td style="padding:8px 12px;background:#0a0a0a;font-size:13px;color:${ACCENT};font-weight:600;">${due}</td>
      </tr>
    </table>
    <p style="font-size:12px;color:#6b7280;margin:0;">Login to <strong style="color:#9ca3af">WorkSyne</strong> to view and update your task.</p>
  `);
  await sendMail({ to: recipient, subject: `New Task Assigned: ${taskTitle}`, html });
}

// 3. Task Completed - notify founders/admin
export async function sendTaskCompletedEmail({ taskTitle, completedByName, department, completedAt, recipients }) {
  const time = new Date(completedAt).toLocaleString('en-IN', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' });
  const html = baseTemplate(`Task Completed: ${taskTitle}`, `
    <div style="text-align:center;margin-bottom:24px;">
      <div style="font-size:48px;margin-bottom:8px;">✅</div>
      <h2 style="font-size:18px;font-weight:700;color:${ACCENT};margin:0;">${taskTitle}</h2>
      <p style="font-size:13px;color:#9ca3af;margin:4px 0 0;">has been completed</p>
    </div>
    <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
      <tr>
        <td style="padding:8px 12px;background:#0a0a0a;border-radius:8px 0 0 8px;font-size:12px;color:#6b7280;width:40%;">Completed by</td>
        <td style="padding:8px 12px;background:#0a0a0a;font-size:13px;color:#fff;font-weight:600;">${completedByName}</td>
      </tr>
      <tr><td colspan="2" style="height:4px;"></td></tr>
      <tr>
        <td style="padding:8px 12px;background:#0a0a0a;border-radius:8px 0 0 8px;font-size:12px;color:#6b7280;">Department</td>
        <td style="padding:8px 12px;background:#0a0a0a;font-size:13px;color:#9ca3af;">${department}</td>
      </tr>
      <tr><td colspan="2" style="height:4px;"></td></tr>
      <tr>
        <td style="padding:8px 12px;background:#0a0a0a;border-radius:8px 0 0 8px;font-size:12px;color:#6b7280;">Completed at</td>
        <td style="padding:8px 12px;background:#0a0a0a;font-size:13px;color:${ACCENT};">${time}</td>
      </tr>
    </table>
    <p style="font-size:12px;color:#6b7280;margin:0;">Login to <strong style="color:#9ca3af">WorkSyne</strong> to view the task details.</p>
  `);
  await sendMail({ to: recipients, subject: `✅ Task Completed: ${taskTitle} by ${completedByName}`, html });
}

// 4. Founder shares a task with another founder
export async function sendFounderTaskSharedEmail({ taskTitle, description, priority, dueDate, sharedByName, note, recipient }) {
  const due = dueDate ? new Date(dueDate).toLocaleDateString('en-IN', { day:'numeric', month:'long', year:'numeric' }) : 'No due date';
  const priColor = { URGENT:'#f87171', HIGH:'#fb923c', MEDIUM:'#f5e642', LOW:ACCENT }[priority] || ACCENT;
  const html = baseTemplate(`Task Shared With You: ${taskTitle}`, `
    <h2 style="font-size:18px;font-weight:700;color:#fff;margin:0 0 6px;">${taskTitle}</h2>
    <span style="display:inline-block;background:${priColor}20;color:${priColor};font-size:11px;font-weight:600;padding:3px 10px;border-radius:999px;border:1px solid ${priColor}44;margin-bottom:16px;">
      ${priority}
    </span>
    ${description ? `<p style="font-size:14px;color:#d1d5db;line-height:1.6;margin:0 0 16px;">${description}</p>` : ''}
    ${note ? `<div style="background:rgba(57,255,20,0.05);border-left:3px solid ${ACCENT};padding:10px 14px;border-radius:0 8px 8px 0;margin-bottom:16px;">
      <p style="font-size:12px;color:#6b7280;margin:0 0 4px;">Note from ${sharedByName}:</p>
      <p style="font-size:13px;color:#d1d5db;margin:0;">${note}</p>
    </div>` : ''}
    <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
      <tr>
        <td style="padding:8px 12px;background:#0a0a0a;border-radius:8px 0 0 8px;font-size:12px;color:#6b7280;width:40%;">Shared by</td>
        <td style="padding:8px 12px;background:#0a0a0a;font-size:13px;color:#fff;font-weight:600;">${sharedByName}</td>
      </tr>
      <tr><td colspan="2" style="height:4px;"></td></tr>
      <tr>
        <td style="padding:8px 12px;background:#0a0a0a;border-radius:8px 0 0 8px;font-size:12px;color:#6b7280;">Due Date</td>
        <td style="padding:8px 12px;background:#0a0a0a;font-size:13px;color:${ACCENT};font-weight:600;">${due}</td>
      </tr>
    </table>
    <p style="font-size:12px;color:#6b7280;margin:0;">Login to <strong style="color:#9ca3af">WorkSyne</strong> to view this task in your Founder board.</p>
  `);
  await sendMail({ to: recipient, subject: `Task Shared: ${taskTitle} (from ${sharedByName})`, html });
}

// 5. Welcome email for new employee
export async function sendWelcomeEmail({ name, email, employeeId, department, designation, role }) {
  const html = baseTemplate(`Welcome to ${COMPANY}`, `
    <div style="text-align:center;margin-bottom:24px;">
      <div style="font-size:48px;margin-bottom:8px;">👋</div>
      <h2 style="font-size:20px;font-weight:700;color:#fff;margin:0;">Welcome, ${name}!</h2>
      <p style="font-size:13px;color:#9ca3af;margin:4px 0 0;">Your WorkSyne account is ready</p>
    </div>
    <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
      ${[['Email', email], ['Employee ID', employeeId], ['Department', department], ['Designation', designation], ['Role', role]].map(([k,v]) => `
      <tr>
        <td style="padding:8px 12px;background:#0a0a0a;font-size:12px;color:#6b7280;width:40%;">${k}</td>
        <td style="padding:8px 12px;background:#0a0a0a;font-size:13px;color:#fff;font-weight:500;">${v}</td>
      </tr>
      <tr><td colspan="2" style="height:3px;"></td></tr>
      `).join('')}
    </table>
    <div style="background:rgba(57,255,20,0.05);border:1px solid rgba(57,255,20,0.2);border-radius:10px;padding:14px;margin-bottom:16px;">
      <p style="font-size:13px;color:#9ca3af;margin:0 0 6px;">🔑 Default Password:</p>
      <p style="font-size:18px;font-weight:700;color:${ACCENT};margin:0;letter-spacing:2px;">Welcome@123</p>
      <p style="font-size:11px;color:#6b7280;margin:6px 0 0;">Please change your password after first login.</p>
    </div>
    <p style="font-size:12px;color:#6b7280;margin:0;">Contact your admin if you have any questions.</p>
  `);
  await sendMail({ to: email, subject: `Welcome to ${COMPANY} - Your WorkSyne Account`, html });
}

// 6. Added to a team
export async function sendTeamWelcomeEmail({ memberName, memberEmail, teamName, teamDepartment, leadName, addedByName }) {
  const html = baseTemplate(`You've been added to Team: ${teamName}`, `
    <div style="text-align:center;margin-bottom:24px;">
      <div style="font-size:48px;margin-bottom:8px;">👥</div>
      <h2 style="font-size:20px;font-weight:700;color:#fff;margin:0;">You're in, ${memberName}!</h2>
      <p style="font-size:13px;color:#9ca3af;margin:4px 0 0;">You've been added to a new team</p>
    </div>
    <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
      <tr>
        <td style="padding:8px 12px;background:#0a0a0a;font-size:12px;color:#6b7280;width:40%;">Team</td>
        <td style="padding:8px 12px;background:#0a0a0a;font-size:13px;color:#fff;font-weight:600;">${teamName}</td>
      </tr>
      <tr><td colspan="2" style="height:3px;"></td></tr>
      <tr>
        <td style="padding:8px 12px;background:#0a0a0a;font-size:12px;color:#6b7280;">Department</td>
        <td style="padding:8px 12px;background:#0a0a0a;font-size:13px;color:#9ca3af;">${teamDepartment}</td>
      </tr>
      <tr><td colspan="2" style="height:3px;"></td></tr>
      ${leadName ? `<tr>
        <td style="padding:8px 12px;background:#0a0a0a;font-size:12px;color:#6b7280;">Team Lead</td>
        <td style="padding:8px 12px;background:#0a0a0a;font-size:13px;color:${ACCENT};font-weight:600;">${leadName}</td>
      </tr>
      <tr><td colspan="2" style="height:3px;"></td></tr>` : ''}
      <tr>
        <td style="padding:8px 12px;background:#0a0a0a;font-size:12px;color:#6b7280;">Added by</td>
        <td style="padding:8px 12px;background:#0a0a0a;font-size:13px;color:#9ca3af;">${addedByName}</td>
      </tr>
    </table>
    <p style="font-size:12px;color:#6b7280;margin:0;">Login to <strong style="color:#9ca3af">WorkSyne</strong> to see your team details.</p>
  `);
  await sendMail({ to: memberEmail, subject: `You've been added to Team: ${teamName}`, html });
}
