import nodemailer from "nodemailer";

let transporter: ReturnType<typeof nodemailer.createTransport> | null = null;

function getTransporter() {
  if (transporter) return transporter;
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) return null;

  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: Number(process.env.SMTP_PORT ?? 587) === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  return transporter;
}

/**
 * Sends a workspace invite email if SMTP is configured. Returns false (without
 * throwing) when it isn't, so callers can fall back to showing a copyable
 * invite link instead of pretending an email went out.
 */
export async function sendInviteEmail({
  to,
  workspaceName,
  inviterName,
  inviteLink,
}: {
  to: string;
  workspaceName: string;
  inviterName: string;
  inviteLink: string;
}): Promise<boolean> {
  const t = getTransporter();
  if (!t) return false;

  try {
    await t.sendMail({
      from: process.env.SMTP_FROM ?? process.env.SMTP_USER,
      to,
      subject: `${inviterName} invited you to "${workspaceName}" on CollabSpace`,
      html: `
        <p>${inviterName} invited you to join the <strong>${workspaceName}</strong> workspace on CollabSpace.</p>
        <p><a href="${inviteLink}">Click here to accept the invite</a></p>
        <p>This link expires in 7 days. If you weren't expecting this, you can ignore it.</p>
      `,
    });
    return true;
  } catch (err) {
    console.error("Failed to send invite email:", err);
    return false;
  }
}
