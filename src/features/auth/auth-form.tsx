"use client";

import * as React from "react";
import { useActionState } from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";

import type { AuthActionResult } from "@/features/auth/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

interface AuthFormProps {
  action: (
    prev: AuthActionResult | null,
    formData: FormData,
  ) => Promise<AuthActionResult>;
  submitLabel: string;
  children: React.ReactNode;
}

/**
 * Wrapper de formulário de autenticação: estado da action, mensagens de
 * erro/sucesso e proteção contra envio duplicado (botão desabilitado
 * durante o pending).
 */
export function AuthForm({ action, submitLabel, children }: AuthFormProps) {
  const [state, formAction, pending] = useActionState(action, null);

  return (
    <form action={formAction} className="space-y-4">
      {state?.error && (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      {state?.ok && state.message && (
        <Alert variant="success">
          <CheckCircle2 />
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}
      {children}
      <Button type="submit" className="w-full" loading={pending}>
        {submitLabel}
      </Button>
    </form>
  );
}
