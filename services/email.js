import axios from 'axios';

// ─────────────────────────────────────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────────────────────────────────────
const COMPANY  = process.env.COMPANY_NAME || 'A5x Industries';
const APP_NAME = 'WorkSyne';
const ACCENT   = '#39ff14';

// ─────────────────────────────────────────────────────────────────────────────
// BREVO HTTP API (works on Render — uses port 443, no SMTP port needed)
// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// GENERIC SEND HELPER — Brevo REST API (port 443, works on Render free tier)
// ─────────────────────────────────────────────────────────────────────────────
async function sendMail({ to, subject, html }) {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    console.warn('⚠️  Email skipped — BREVO_API_KEY missing in .env');
    return;
  }

  const recipients = Array.isArray(to) ? to : [to];
  const filtered   = recipients.filter(Boolean);
  if (filtered.length === 0) return;

  const fromEmail = process.env.SMTP_FROM || 'office.a5xindustries@gmail.com';
  const fromName  = `${APP_NAME} · ${COMPANY}`;

  try {
    await axios.post(
      'https://api.brevo.com/v3/smtp/email',
      {
        sender:      { name: fromName, email: fromEmail },
        to:          filtered.map(email => ({ email })),
        subject:     `[${APP_NAME}] ${subject}`,
        htmlContent: html,
      },
      {
        headers: {
          'api-key':     apiKey,
          'Content-Type': 'application/json',
        },
      }
    );
    console.log(`📧 [Brevo API] Sent: "${subject}" → ${filtered.join(', ')}`);
  } catch (err) {
    console.error('📧 [Brevo API] Failed:', err?.response?.data || err.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// BASE HTML TEMPLATE
// ─────────────────────────────────────────────────────────────────────────────
function baseTemplate(title, bodyHtml) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:'Segoe UI',Arial,sans-serif;color:#1a1a1a;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:36px 16px;">
    <tr>
      <td align="center">
        <table width="100%" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.08);">

          <!-- Header -->
          <tr>
            <td style="background:#0d0d0d;padding:22px 28px;border-bottom:3px solid ${ACCENT};">
              <span style="font-size:22px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;">
                WORK<span style="color:${ACCENT}">SYNE</span>
              </span>
              <span style="float:right;font-size:11px;color:#9ca3af;line-height:28px;">${COMPANY}</span>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:32px 28px;">
              ${bodyHtml}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:16px 28px;background:#f9fafb;border-top:1px solid #e5e7eb;font-size:11px;color:#9ca3af;text-align:center;line-height:1.6;">
              This is an automated message from <strong style="color:#6b7280;">${APP_NAME}</strong> · ${COMPANY}<br/>
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

// helper: priority badge colors
function priColors(priority) {
  const map = {
    URGENT: { text: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
    HIGH:   { text: '#ea580c', bg: '#fff7ed', border: '#fed7aa' },
    MEDIUM: { text: '#d97706', bg: '#fffbeb', border: '#fde68a' },
    LOW:    { text: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0' },
  };
  return map[priority] || map.LOW;
}

// helper: info row
function infoRow(label, value, valueColor) {
  return `
  <tr>
    <td style="padding:10px 14px;background:#f9fafb;border-radius:8px 0 0 8px;font-size:12px;color:#6b7280;width:38%;border:1px solid #e5e7eb;border-right:none;">${label}</td>
    <td style="padding:10px 14px;background:#f9fafb;border-radius:0 8px 8px 0;font-size:13px;color:${valueColor || '#111'};font-weight:600;border:1px solid #e5e7eb;border-left:none;">${value}</td>
  </tr>
  <tr><td colspan="2" style="height:5px;"></td></tr>`;
}

// ═════════════════════════════════════════════════════════════════════════════
// EMAIL TEMPLATES
// ═════════════════════════════════════════════════════════════════════════════

// 1. New Announcement
export async function sendAnnouncementEmail({ title, body, priority, createdByName, recipients }) {
  const c = priority === 'URGENT' ? priColors('URGENT')
           : priority === 'HIGH'  ? priColors('HIGH')
           : { text: '#0369a1', bg: '#f0f9ff', border: '#bae6fd' };

  const html = baseTemplate(`Announcement: ${title}`, `
    <h2 style="font-size:20px;font-weight:700;color:#111;margin:0 0 10px;">${title}</h2>

    <span style="display:inline-block;background:${c.bg};color:${c.text};font-size:11px;font-weight:700;
      padding:4px 12px;border-radius:999px;border:1px solid ${c.border};margin-bottom:20px;text-transform:uppercase;letter-spacing:0.5px;">
      📢 ${priority || 'GENERAL'}
    </span>

    <div style="background:#f9fafb;border-left:4px solid ${ACCENT};border-radius:0 8px 8px 0;
      padding:14px 18px;margin-bottom:24px;font-size:14px;color:#374151;line-height:1.7;white-space:pre-line;">
      ${body}
    </div>

    <hr style="border:none;border-top:1px solid #e5e7eb;margin-bottom:14px;"/>
    <p style="font-size:12px;color:#9ca3af;margin:0;">
      Posted by <strong style="color:#374151;">${createdByName}</strong>
    </p>
  `);

  await sendMail({ to: recipients, subject: `Announcement: ${title}`, html });
}

// 2. New Task Assigned
export async function sendTaskAssignedEmail({ taskTitle, description, priority, dueDate, assignedByName, recipient }) {
  const due = dueDate
    ? new Date(dueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
    : 'No due date';
  const c = priColors(priority);

  const html = baseTemplate(`New Task: ${taskTitle}`, `
    <div style="margin-bottom:6px;">
      <span style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#9ca3af;">New Task Assigned</span>
    </div>
    <h2 style="font-size:20px;font-weight:700;color:#111;margin:0 0 12px;">${taskTitle}</h2>

    <span style="display:inline-block;background:${c.bg};color:${c.text};font-size:11px;font-weight:700;
      padding:4px 12px;border-radius:999px;border:1px solid ${c.border};margin-bottom:20px;text-transform:uppercase;letter-spacing:0.5px;">
      ${priority || 'MEDIUM'} PRIORITY
    </span>

    ${description ? `
    <p style="font-size:14px;color:#374151;line-height:1.7;margin:0 0 20px;
      background:#f9fafb;padding:14px;border-radius:8px;border:1px solid #e5e7eb;">${description}</p>
    ` : ''}

    <table style="width:100%;border-collapse:separate;border-spacing:0;margin-bottom:24px;">
      ${infoRow('Assigned by', assignedByName, '#111')}
      ${infoRow('Due Date', due, c.text)}
    </table>

    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:14px 18px;">
      <p style="font-size:13px;color:#166534;margin:0;">
        🔔 Login to <strong>WorkSyne</strong> to view and update your task.
      </p>
    </div>
  `);

  await sendMail({ to: recipient, subject: `New Task: ${taskTitle}`, html });
}

// 3. Task Completed (notify admins/founders)
export async function sendTaskCompletedEmail({ taskTitle, completedByName, department, completedAt, recipients }) {
  const time = new Date(completedAt).toLocaleString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });

  const html = baseTemplate(`Task Completed: ${taskTitle}`, `
    <div style="text-align:center;margin-bottom:28px;">
      <div style="font-size:52px;margin-bottom:10px;">✅</div>
      <h2 style="font-size:20px;font-weight:700;color:#16a34a;margin:0;">${taskTitle}</h2>
      <p style="font-size:13px;color:#6b7280;margin:6px 0 0;">has been marked as completed</p>
    </div>

    <table style="width:100%;border-collapse:separate;border-spacing:0;margin-bottom:20px;">
      ${infoRow('Completed by', completedByName, '#111')}
      ${infoRow('Department', department, '#374151')}
      ${infoRow('Completed at', time, '#16a34a')}
    </table>
  `);

  await sendMail({ to: recipients, subject: `✅ Task Completed: ${taskTitle}`, html });
}

// 4. Founder shares a task
export async function sendFounderTaskSharedEmail({ taskTitle, description, priority, dueDate, sharedByName, note, recipient }) {
  const due = dueDate
    ? new Date(dueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
    : 'No due date';
  const c = priColors(priority);

  const html = baseTemplate(`Task Shared: ${taskTitle}`, `
    <div style="margin-bottom:6px;">
      <span style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#9ca3af;">Task Shared With You</span>
    </div>
    <h2 style="font-size:20px;font-weight:700;color:#111;margin:0 0 12px;">${taskTitle}</h2>

    <span style="display:inline-block;background:${c.bg};color:${c.text};font-size:11px;font-weight:700;
      padding:4px 12px;border-radius:999px;border:1px solid ${c.border};margin-bottom:20px;text-transform:uppercase;letter-spacing:0.5px;">
      ${priority || 'MEDIUM'} PRIORITY
    </span>

    ${description ? `
    <p style="font-size:14px;color:#374151;line-height:1.7;margin:0 0 20px;
      background:#f9fafb;padding:14px;border-radius:8px;border:1px solid #e5e7eb;">${description}</p>
    ` : ''}

    ${note ? `
    <div style="background:#fffbeb;border-left:4px solid #f59e0b;padding:12px 16px;border-radius:0 8px 8px 0;margin-bottom:20px;">
      <p style="font-size:11px;font-weight:700;color:#92400e;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 5px;">
        Note from ${sharedByName}
      </p>
      <p style="font-size:13px;color:#374151;margin:0;">${note}</p>
    </div>` : ''}

    <table style="width:100%;border-collapse:separate;border-spacing:0;margin-bottom:24px;">
      ${infoRow('Shared by', sharedByName, '#111')}
      ${infoRow('Due Date', due, c.text)}
    </table>

    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:14px 18px;">
      <p style="font-size:13px;color:#166534;margin:0;">
        🔔 Login to <strong>WorkSyne</strong> to view this task.
      </p>
    </div>
  `);

  await sendMail({ to: recipient, subject: `Task Shared: ${taskTitle}`, html });
}

// 5. Welcome email for new employee
export async function sendWelcomeEmail({ name, email, employeeId, department, designation, role }) {
  const html = baseTemplate(`Welcome to ${COMPANY}`, `
    <div style="text-align:center;margin-bottom:28px;">
      <div style="font-size:52px;margin-bottom:10px;">👋</div>
      <h2 style="font-size:22px;font-weight:700;color:#111;margin:0;">Welcome, ${name}!</h2>
      <p style="font-size:13px;color:#6b7280;margin:6px 0 0;">Your WorkSyne account is ready</p>
    </div>

    <table style="width:100%;border-collapse:separate;border-spacing:0;margin-bottom:24px;">
      ${infoRow('Email', email, '#111')}
      ${infoRow('Employee ID', employeeId, '#111')}
      ${infoRow('Department', department, '#111')}
      ${infoRow('Designation', designation, '#111')}
      ${infoRow('Role', role, '#111')}
    </table>

    <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:16px 20px;margin-bottom:20px;">
      <p style="font-size:11px;font-weight:700;color:#92400e;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 6px;">
        🔑 Default Password
      </p>
      <p style="font-size:24px;font-weight:800;color:#d97706;margin:0;letter-spacing:4px;">Welcome@123</p>
      <p style="font-size:11px;color:#b45309;margin:8px 0 0;">Please change your password after your first login.</p>
    </div>

    <p style="font-size:12px;color:#9ca3af;margin:0;">Contact your admin if you have any questions.</p>
  `);

  await sendMail({ to: email, subject: `Welcome to ${COMPANY} - Your Account is Ready`, html });
}

// 6. Added to a team
export async function sendTeamWelcomeEmail({ memberName, memberEmail, teamName, teamDepartment, leadName, addedByName }) {
  const html = baseTemplate(`Added to Team: ${teamName}`, `
    <div style="text-align:center;margin-bottom:28px;">
      <div style="font-size:52px;margin-bottom:10px;">👥</div>
      <h2 style="font-size:20px;font-weight:700;color:#111;margin:0;">You're in, ${memberName}!</h2>
      <p style="font-size:13px;color:#6b7280;margin:6px 0 0;">You've been added to a new team</p>
    </div>

    <table style="width:100%;border-collapse:separate;border-spacing:0;margin-bottom:24px;">
      ${infoRow('Team', teamName, '#111')}
      ${infoRow('Department', teamDepartment, '#374151')}
      ${leadName ? infoRow('Team Lead', leadName, '#16a34a') : ''}
      ${infoRow('Added by', addedByName, '#374151')}
    </table>

    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:14px 18px;">
      <p style="font-size:13px;color:#166534;margin:0;">
        🔔 Login to <strong>WorkSyne</strong> to see your team details.
      </p>
    </div>
  `);

  await sendMail({ to: memberEmail, subject: `You've been added to Team: ${teamName}`, html });
}
