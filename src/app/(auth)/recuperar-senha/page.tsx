import type { Metadata } from "next";
import Link from "next/link";

import { forgotPasswordAction } from "@/features/auth/actions";
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

export const metadata: Metadata = { title: "Recuperar senha" };

export default function RecuperarSenhaPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Recuperar senha</CardTitle>
        <CardDescription>
          Enviaremos um link de redefinição para o seu e-mail.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <AuthForm action={forgotPasswordAction} submitLabel="Enviar link">
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
        </AuthForm>
        <p className="text-muted-foreground mt-4 text-center text-sm">
          Lembrou a senha?{" "}
          <Link
            href="/login"
            className="text-primary font-medium underline-offset-4 hover:underline"
          >
            Voltar ao login
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
