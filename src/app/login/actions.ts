"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { allow, clientIp, TOO_MANY } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";

export interface AuthState {
  error?: string;
  info?: string;
}

const credentials = z.object({
  email: z.string().trim().email("Enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export async function signIn(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = credentials.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const ip = await clientIp();
  const email = parsed.data.email.toLowerCase();
  if (!(await allow(`login:ip:${ip}`, 20, 600)) || !(await allow(`login:email:${email}`, 8, 600))) {
    return { error: TOO_MANY };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: "Email or password is incorrect." };

  redirect("/dashboard");
}

export async function signUp(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = credentials.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  if (!(await allow(`signup:ip:${await clientIp()}`, 5, 3600))) return { error: TOO_MANY };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp(parsed.data);
  if (error) {
    if (error.code === "weak_password") {
      return { error: "Choose a stronger password: at least 8 characters, not a common one." };
    }
    // Don't reveal whether an email is already registered.
    return { error: "Could not create the account. If you already have one, log in instead." };
  }

  // If email confirmation is switched on in Supabase, there is no session yet.
  if (!data.session) {
    return { info: "Check your email to confirm your account, then log in." };
  }
  redirect("/onboarding");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
