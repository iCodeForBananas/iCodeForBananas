import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";

export const dynamic = "force-dynamic";

// Called by Vercel cron daily (see vercel.json).
// Also callable manually with the CRON_SECRET header for testing.
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get("Authorization");
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }
  }

  const userId = process.env.TASK_REMINDER_USER_ID;
  if (!userId) {
    return NextResponse.json({ success: false, error: "TASK_REMINDER_USER_ID not set" }, { status: 500 });
  }

  const toEmail = process.env.TASK_REMINDER_EMAIL;
  const fromEmail = process.env.TASK_REMINDER_FROM_EMAIL;
  if (!toEmail || !fromEmail) {
    return NextResponse.json({ success: false, error: "TASK_REMINDER_EMAIL or TASK_REMINDER_FROM_EMAIL not set" }, { status: 500 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Prefer the top in-progress task, fall back to top backlog task
  const { data: inProgress } = await supabase
    .from("tasks")
    .select("*")
    .eq("user_id", userId)
    .eq("board_column", "in-progress")
    .order("sort_order", { ascending: true })
    .limit(1);

  let topTask = inProgress?.[0] ?? null;

  if (!topTask) {
    const { data: backlog } = await supabase
      .from("tasks")
      .select("*")
      .eq("user_id", userId)
      .eq("board_column", "backlog")
      .order("sort_order", { ascending: true })
      .limit(1);
    topTask = backlog?.[0] ?? null;
  }

  if (!topTask) {
    return NextResponse.json({ success: true, message: "No active tasks" });
  }

  const ses = new SESClient({
    region: process.env.AWS_SES_REGION ?? "us-east-1",
    credentials: {
      accessKeyId: process.env.AWS_SES_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SES_SECRET_ACCESS_KEY!,
    },
  });

  const plainBody = topTask.body.replace(/<[^>]+>/g, "").trim();
  const taskUrl = "https://www.icodeforbananas.com/task-board";
  const column = topTask.board_column === "in-progress" ? "In Progress" : "Backlog";

  const html = `
<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#1a1a1a">
  <p style="margin:0 0 4px;font-size:13px;color:#888;text-transform:uppercase;letter-spacing:.05em">${column}</p>
  <h2 style="margin:0 0 16px;font-size:20px">${topTask.title}</h2>
  ${plainBody ? `<p style="margin:0 0 20px;color:#555;line-height:1.6;white-space:pre-wrap">${plainBody}</p>` : ""}
  <a href="${taskUrl}" style="display:inline-block;padding:10px 18px;background:#6366f1;color:#fff;text-decoration:none;border-radius:6px;font-size:14px">Open Task Board →</a>
</div>`;

  await ses.send(
    new SendEmailCommand({
      Destination: { ToAddresses: [toEmail] },
      Source: fromEmail,
      Message: {
        Subject: { Data: `Task: ${topTask.title}` },
        Body: {
          Html: { Data: html },
          Text: { Data: `${column}\n${topTask.title}\n\n${plainBody}\n\n${taskUrl}` },
        },
      },
    }),
  );

  return NextResponse.json({ success: true, task: topTask.title });
}
