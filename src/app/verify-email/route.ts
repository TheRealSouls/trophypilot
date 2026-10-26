import { NextResponse } from "next/server";
import { confirmEmail } from "@/lib/email";
import { SITE } from "@/lib/site";

export const dynamic = "force-dynamic";

/** The link in the verification email. Confirms the address, then shows Settings with the result. */
export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token") ?? "";
  const ok = token ? await confirmEmail(token) : false;
  return NextResponse.redirect(new URL(`/settings?verified=${ok ? "1" : "0"}`, SITE.url), { headers: { "Referrer-Policy": "no-referrer" } });
}
