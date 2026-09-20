"use server";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getAppUrl } from "@/lib/app-url";
import {
  loginSchema,
  registerSchema,
  forgotPasswordSchema,
} from "@/validations/auth";

export interface AuthActionResult {
  ok: boolean;
  error?: string;
  message?: string;
}

const NOT_CONFIGURED_ERROR =
  "O Supabase ainda não está configurado (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY). " +
  "Enquanto isso, o painel está disponível em modo demonstração.";

export async function loginAction(
  _prev: AuthActionResult | null,
  formData: FormData,
): Promise<AuthActionResult> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  if (!isSupabaseConfigured()) {
    return { ok: false, error: NOT_CONFIGURED_ERROR };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    return {
      ok: false,
      error:
        error.code === "invalid_credentials"
          ? "E-mail ou senha incorretos."
          : "Não foi possível entrar. Tente novamente.",
    };
  }

  const redirectTo = formData.get("redirect");
  redirect(
    typeof redirectTo === "string" && redirectTo.startsWith("/")
      ? redirectTo
      : "/dashboard",
  );
}

export async function registerAction(
  _prev: AuthActionResult | null,
  formData: FormData,
): Promise<AuthActionResult> {
  const parsed = registerSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  if (!isSupabaseConfigured()) {
    return { ok: false, error: NOT_CONFIGURED_ERROR };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { name: parsed.data.name },
    },
  });

  if (error) {
    return {
      ok: false,
      error:
        error.code === "user_already_exists"
          ? "Já existe uma conta com este e-mail."
          : "Não foi possível criar a conta. Tente novamente.",
    };
  }

  return {
    ok: true,
    message:
      "Conta criada! Verifique seu e-mail para confirmar o cadastro antes de entrar.",
  };
}

export async function forgotPasswordAction(
  _prev: AuthActionResult | null,
  formData: FormData,
): Promise<AuthActionResult> {
  const parsed = forgotPasswordSchema.safeParse({
    email: formData.get("email"),
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  if (!isSupabaseConfigured()) {
    return { ok: false, error: NOT_CONFIGURED_ERROR };
  }

  const supabase = await createClient();
  const appUrl = getAppUrl();
  const { error } = await supabase.auth.resetPasswordForEmail(
    parsed.data.email,
    { redirectTo: `${appUrl}/auth/redefinir-senha` },
  );

  if (error) {
    return {
      ok: false,
      error: "Não foi possível enviar o e-mail. Tente novamente.",
    };
  }

  return {
    ok: true,
    message:
      "Se existir uma conta com este e-mail, você receberá um link de recuperação.",
  };
}

export async function logoutAction(): Promise<void> {
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }
  redirect("/login");
}
