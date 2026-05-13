import { NextResponse, NextRequest } from "next/server";
import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const file = request.nextUrl.searchParams.get("file");
  if (!file) {
    return NextResponse.json({ success: false, error: "Missing file param" }, { status: 400 });
  }

  // Reject anything that isn't a plain .csv basename — blocks path traversal.
  // `=` is allowed for futures tickers (e.g. ES=F, NQ=F).
  const safe = path.basename(file);
  if (safe !== file || !/^[A-Za-z0-9._=-]+\.csv$/.test(safe)) {
    return NextResponse.json({ success: false, error: "Invalid file name" }, { status: 400 });
  }

  const filePath = path.join(process.cwd(), "data", safe);
  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ success: false, error: "File not found" }, { status: 404 });
  }

  const csv = await fs.promises.readFile(filePath, "utf-8");
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
