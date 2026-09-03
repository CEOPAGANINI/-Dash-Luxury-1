"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type EstadoLogin = { erro?: string; aviso?: string };

function lerCredenciais(formData: FormData) {
  return {
    email: String(formData.get("email") ?? "").trim(),
    password: String(formData.get("senha") ?? ""),
  };
}

export async function entrar(
  _estado: EstadoLogin,
  formData: FormData,
): Promise<EstadoLogin> {
  const credenciais = lerCredenciais(formData);
  if (!credenciais.email || !credenciais.password) {
    return { erro: "Preencha e-mail e senha." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(credenciais);

  if (error) {
    return {
      erro:
        error.message === "Invalid login credentials"
          ? "E-mail ou senha não conferem."
          : error.message,
    };
  }

  revalidatePath("/", "layout");
  redirect("/painel");
}

export async function cadastrar(
  _estado: EstadoLogin,
  formData: FormData,
): Promise<EstadoLogin> {
  const credenciais = lerCredenciais(formData);
  const nome = String(formData.get("nome") ?? "").trim();

  if (!credenciais.email || !credenciais.password) {
    return { erro: "Preencha e-mail e senha." };
  }
  if (credenciais.password.length < 6) {
    return { erro: "A senha precisa de pelo menos 6 caracteres." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    ...credenciais,
    options: { data: { nome: nome || null } },
  });

  if (error) return { erro: error.message };

  if (!data.session) {
    return {
      aviso:
        "Conta criada. Confirme o e-mail que acabamos de enviar e depois entre.",
    };
  }

  revalidatePath("/", "layout");
  redirect("/painel");
}

export async function sair() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}
