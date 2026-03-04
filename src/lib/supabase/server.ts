import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        },
      },
    },
  );
}

export async function getCurrentOrgId(
  supabase: ReturnType<typeof createServerClient>,
): Promise<string | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return (
    ((session?.user?.app_metadata as Record<string, unknown>)
      ?.current_org_id as string) ?? null
  );
}
