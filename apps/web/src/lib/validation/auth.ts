import { z } from "zod";

export const signInSchema = z.object({
  email: z.string().trim().min(1, "Enter your email address.").pipe(z.email("Enter an email address like name@example.com.")),
  password: z.string().min(1, "Enter your password."),
});

export const signUpSchema = z.object({
  fullName: z.string().trim().min(2, "Enter your full name.").max(120, "Use 120 characters or fewer."),
  email: z.string().trim().min(1, "Enter your email address.").pipe(z.email("Enter an email address like name@example.com.")),
  password: z.string().min(10, "Use at least 10 characters.").max(256, "Use 256 characters or fewer."),
});
