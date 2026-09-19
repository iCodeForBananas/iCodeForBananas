import { NextResponse, NextRequest } from "next/server";
import fs from "fs";
import path from "path";
import { AVAILABLE_STRATEGIES } from "@/app/strategies";

export const dynamic = "force-dynamic";

// Serves a strategy's TypeScript source so the Lambda prompt can hand the
// exact entry/exit logic to whoever writes the live version, instead of a
// one-line description. Only ids in the registry resolve, which also blocks
// path traversal: each id is its file's basename.
export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  if (!id || !Object.hasOwn(AVAILABLE_STRATEGIES, id)) {
    return NextResponse.json({ success: false, error: "Unknown strategy" }, { status: 400 });
  }

  const filePath = path.join(process.cwd(), "app", "strategies", `${id}.ts`);
  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ success: false, error: "Source not found" }, { status: 404 });
  }

  const source = await fs.promises.readFile(filePath, "utf-8");
  return new NextResponse(source, {
    status: 200,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
