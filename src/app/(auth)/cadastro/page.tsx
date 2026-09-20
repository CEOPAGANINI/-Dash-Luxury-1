import type { Metadata } from "next";
import Link from "next/link";

import { registerAction } from "@/features/auth/actions";
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

export const metadata: Metadata = { title: "Criar conta" };

export default function CadastroPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Criar sua conta</CardTitle>
        <CardDescription>Comece a vender em poucos minutos.</CardDescription>
      </CardHeader>
      <CardContent>
        <AuthForm action={registerAction} submitLabel="Criar conta">
          <div className="space-y-2">
            <Label htmlFor="name">Nome</Label>
            <Input
              id="name"
              name="name"
              placeholder="Seu nome"
              autoComplete="name"
              required
            />
          </div>
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
            <Label htmlFor="password">Senha</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirmar senha</Label>
            <Input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
            />
          </div>
        </AuthForm>
        <p className="text-muted-foreground mt-4 text-center text-sm">
          Já tem conta?{" "}
          <Link
            href="/login"
            className="text-primary font-medium underline-offset-4 hover:underline"
          >
            Entrar
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
