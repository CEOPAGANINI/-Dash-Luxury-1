import type { Metadata } from "next";
import Link from "next/link";

import { loginAction } from "@/features/auth/actions";
import { AuthForm } from "@/features/auth/auth-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const metadata: Metadata = { title: "Entrar" };

export default async function LoginPage(props: PageProps<"/login">) {
  const searchParams = await props.searchParams;
  const redirect =
    typeof searchParams.redirect === "string" ? searchParams.redirect : "";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Entrar na sua conta</CardTitle>
        <CardDescription>
          Acesse o painel para gerenciar suas vendas.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <AuthForm action={loginAction} submitLabel="Entrar">
          <input type="hidden" name="redirect" value={redirect} />
          <div className="space-y-2">
            <Label htmlFor="email">E-mail</Label>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder="voce@exemplo.com"
              autoComplete="email"
              required
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Senha</Label>
              <Link
                href="/recuperar-senha"
                className="text-muted-foreground hover:text-foreground text-xs underline-offset-4 hover:underline"
              >
                Esqueceu a senha?
              </Link>
            </div>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </div>
        </AuthForm>
        <p className="text-muted-foreground mt-4 text-center text-sm">
          Não tem conta?{" "}
          <Link
            href="/cadastro"
            className="text-primary font-medium underline-offset-4 hover:underline"
          >
            Criar conta
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
