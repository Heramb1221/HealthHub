import { z } from "zod";

/**
 * Client-side validation for fast feedback only. The API validates again and is authoritative.
 * ASSUMPTION: 8-character minimum password; confirm the real policy with the backend owner.
 */
export const signInSchema = z.object({
  email: z.string().trim().min(1, "Enter your email address.").pipe(z.email("Enter an email address like name@example.com.")),
  password: z.string().min(1, "Enter your password."),
});

export const signUpSchema = z.object({
  fullName: z.string().trim().min(2, "Enter your full name.").max(100, "Use 100 characters or fewer."),
  email: z.string().trim().min(1, "Enter your email address.").pipe(z.email("Enter an email address like name@example.com.")),
  password: z.string().min(10, "Use at least 10 characters.").max(128, "Use 128 characters or fewer."),
});
