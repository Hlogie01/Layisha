"use client";

import { useActionState, useState } from "react";
import { Button, Field, FormMessage, Input } from "@/components/ui";
import { signIn, signUp, type AuthState } from "./actions";

export function AuthForm() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [loginState, loginAction, loginPending] = useActionState<AuthState, FormData>(signIn, {});
  const [signupState, signupAction, signupPending] = useActionState<AuthState, FormData>(
    signUp,
    {},
  );

  const isLogin = mode === "login";
  const state = isLogin ? loginState : signupState;
  const pending = isLogin ? loginPending : signupPending;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 rounded-lg bg-chalk p-1 text-sm font-semibold">
        <button
          type="button"
          onClick={() => setMode("login")}
          className={isLogin ? "rounded-md bg-white py-2 shadow-sm" : "py-2 text-kerb"}
        >
          Log in
        </button>
        <button
          type="button"
          onClick={() => setMode("signup")}
          className={!isLogin ? "rounded-md bg-white py-2 shadow-sm" : "py-2 text-kerb"}
        >
          Create account
        </button>
      </div>

      <form action={isLogin ? loginAction : signupAction} className="space-y-4">
        <Field label="Email" htmlFor="email">
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </Field>
        <Field
          label="Password"
          htmlFor="password"
          hint={isLogin ? undefined : "At least 8 characters"}
        >
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete={isLogin ? "current-password" : "new-password"}
            minLength={8}
            required
          />
        </Field>

        <FormMessage message={state.error} />
        {state.info ? (
          <p className="rounded-lg bg-depot-soft px-3 py-2 text-sm text-depot-dark">{state.info}</p>
        ) : null}

        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? "Please wait…" : isLogin ? "Log in" : "Create account"}
        </Button>
      </form>
    </div>
  );
}
