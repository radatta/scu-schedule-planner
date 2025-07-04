"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import useSupabaseBrowser from "@/lib/supabase/client";
import { usePlannerStore } from "@/hooks/usePlannerStore";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"login" | "signup">("login");
  const router = useRouter();
  const supabase = useSupabaseBrowser();
  const { setUserId } = usePlannerStore();

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (mode === "login") {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) throw error;

        // Persist userId in global store
        if (data.user) {
          setUserId(data.user.id);
        }
        router.push("/");
        router.refresh();
      } else {
        const { data: signUpData, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback`,
          },
        });

        if (error) throw error;

        if (signUpData?.user) {
          setUserId(signUpData.user.id);
        }

        // Show success message for signup
        setError("Check your email for the confirmation link!");
      }
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : "An error occurred during authentication";
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-100">
      <div className="w-full max-w-md rounded-lg bg-white p-8 shadow-md">
        <h1 className="mb-6 text-center text-2xl font-bold">
          {mode === "login"
            ? "Sign in to your account"
            : "Create a new account"}
        </h1>

        {error && (
          <div className="mb-4 rounded bg-red-100 p-3 text-red-800">
            {error}
          </div>
        )}

        <form onSubmit={handleAuth}>
          <div className="mb-4">
            <label
              htmlFor="email"
              className="mb-2 block text-sm font-medium text-gray-700"
            >
              Email
            </label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="mb-6">
            <label
              htmlFor="password"
              className="mb-2 block text-sm font-medium text-gray-700"
            >
              Password
            </label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <Button type="submit" disabled={loading} className="w-full">
            {loading ? "Loading..." : mode === "login" ? "Sign In" : "Sign Up"}
          </Button>
        </form>

        <div className="mt-4 text-center">
          <Button
            variant="link"
            onClick={() => setMode(mode === "login" ? "signup" : "login")}
            className="text-sm text-blue-500 hover:underline p-0 h-auto"
          >
            {mode === "login"
              ? "Need an account? Sign up"
              : "Already have an account? Sign in"}
          </Button>
        </div>
      </div>
    </div>
  );
}
