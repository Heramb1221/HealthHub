"use client";

import * as React from "react";
import { CheckCircle2, LoaderCircle, MessageSquarePlus, Star, ThumbsUp } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ErrorState, LoadingState } from "@/components/feedback/states";
import { describeError } from "@/lib/api/errors";
import { hospitalsApi } from "@/lib/api/hospitals";
import type { HospitalReviewsResult } from "@/lib/api/types";
import { useResource } from "@/lib/use-resource";

const RATING_LABELS: Record<number, string> = {
  1: "Poor experience",
  2: "Fair experience",
  3: "Good consultation & care",
  4: "Very good facility & staff",
  5: "Excellent care & treatment",
};

export function HospitalReviews({ hospitalId, hospitalName }: { hospitalId: string; hospitalName: string }) {
  const reviewsRes = useResource(() => hospitalsApi.reviews(hospitalId), hospitalId);

  const userReview = reviewsRes.status === "ready" ? reviewsRes.data.userReview : null;
  const [userEdited, setUserEdited] = React.useState(false);
  const [rating, setRating] = React.useState<number>(5);
  const [hoverRating, setHoverRating] = React.useState<number | null>(null);
  const [reviewText, setReviewText] = React.useState<string>("");
  const [submitting, setSubmitting] = React.useState(false);
  const [formOpen, setFormOpen] = React.useState(false);

  const currentRating = userEdited ? rating : (userReview?.rating ?? 5);
  const currentReviewText = userEdited ? reviewText : (userReview?.reviewText ?? "");

  async function handleSubmitReview(e: React.FormEvent) {
    e.preventDefault();
    if (currentRating < 1 || currentRating > 5) {
      toast.error("Please select a rating between 1 and 5 stars.");
      return;
    }

    setSubmitting(true);
    try {
      await hospitalsApi.submitReview(hospitalId, {
        rating: currentRating,
        reviewText: currentReviewText.trim() || undefined,
      });
      toast.success("Thank you! Your rating has been submitted.");
      setFormOpen(false);
      setUserEdited(false);
      await reviewsRes.reload();
    } catch (err) {
      const { title, detail } = describeError(err);
      toast.error(title, { description: detail });
    } finally {
      setSubmitting(false);
    }
  }

  if (reviewsRes.status === "loading") {
    return <LoadingState label="Loading patient reviews..." rows={3} />;
  }

  if (reviewsRes.status === "error") {
    return <ErrorState error={reviewsRes.error} onRetry={reviewsRes.reload} />;
  }

  const data: HospitalReviewsResult = reviewsRes.data;
  const activeRating = hoverRating ?? currentRating;
  const hasUserReview = Boolean(data.userReview);

  return (
    <div className="space-y-6">

      <div className="flex flex-col gap-4 rounded-xl border bg-card p-6 shadow-xs sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold text-foreground">Patient Ratings & Reviews</h3>
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
              <CheckCircle2 className="size-3" /> Verified Patients
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            Real patient feedback regarding clinical care, doctors, and waiting time at {hospitalName}.
          </p>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-baseline gap-1.5">
            <span className="text-3xl font-bold tracking-tight text-foreground">
              {data.ratingAverage > 0 ? data.ratingAverage.toFixed(1) : "—"}
            </span>
            <span className="text-sm text-muted-foreground">/ 5.0</span>
          </div>
          <div className="flex flex-col">
            <div className="flex items-center text-amber-500">
              {[1, 2, 3, 4, 5].map((star) => (
                <Star
                  key={star}
                  className={`size-4 ${
                    star <= Math.round(data.ratingAverage)
                      ? "fill-amber-400 text-amber-500"
                      : "fill-muted text-muted-foreground/30"
                  }`}
                />
              ))}
            </div>
            <span className="text-xs text-muted-foreground">
              {data.reviewCount} {data.reviewCount === 1 ? "review" : "reviews"}
            </span>
          </div>

          <Button
            variant={hasUserReview ? "outline" : "default"}
            size="sm"
            onClick={() => setFormOpen((prev) => !prev)}
            className="ml-2 gap-1.5"
          >
            <MessageSquarePlus className="size-4" />
            {hasUserReview ? "Edit Your Rating" : "Rate Hospital"}
          </Button>
        </div>
      </div>

      {formOpen ? (
        <form
          onSubmit={handleSubmitReview}
          className="rounded-xl border border-primary/20 bg-primary/5 p-5 shadow-xs transition-all space-y-4"
        >
          <div className="flex items-center justify-between">
            <h4 className="font-semibold text-foreground">
              {hasUserReview ? "Update your rating" : "Rate your experience"}
            </h4>
            <span className="text-xs text-muted-foreground">
              {activeRating ? RATING_LABELS[activeRating] : "Select your rating"}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                type="button"
                key={star}
                onMouseEnter={() => setHoverRating(star)}
                onMouseLeave={() => setHoverRating(null)}
                onClick={() => {
                  setUserEdited(true);
                  setRating(star);
                }}
                className="group p-1 transition-transform hover:scale-110 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary rounded"
                aria-label={`Rate ${star} out of 5 stars: ${RATING_LABELS[star]}`}
              >
                <Star
                  className={`size-7 transition-colors ${
                    star <= activeRating
                      ? "fill-amber-400 text-amber-500"
                      : "fill-muted text-muted-foreground/40 group-hover:text-amber-400/80"
                  }`}
                />
              </button>
            ))}
            <span className="ml-3 text-sm font-medium text-slate-700 dark:text-slate-300">
              {currentRating} / 5 · <span className="text-muted-foreground text-xs">{RATING_LABELS[currentRating]}</span>
            </span>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="hospital-review-text" className="text-xs font-medium text-foreground">
              Review details (optional)
            </label>
            <textarea
              id="hospital-review-text"
              value={currentReviewText}
              onChange={(e) => {
                setUserEdited(true);
                setReviewText(e.target.value.slice(0, 500));
              }}
              placeholder="Share your experience regarding doctors, staff courtesy, hygiene, or consultation wait time..."
              rows={3}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-xs placeholder:text-muted-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary"
            />
            <div className="flex justify-end text-xs text-muted-foreground">
              {currentReviewText.length} / 500 characters
            </div>
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setFormOpen(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={submitting} className="min-w-[120px]">
              {submitting ? (
                <>
                  <LoaderCircle className="animate-spin motion-reduce:animate-none size-4" />
                  Saving...
                </>
              ) : (
                "Submit Rating"
              )}
            </Button>
          </div>
        </form>
      ) : null}

      {data.reviews.length === 0 ? (
        <div className="rounded-xl border border-dashed p-8 text-center bg-card/50">
          <ThumbsUp className="mx-auto size-8 text-muted-foreground/60" />
          <h4 className="mt-2 text-sm font-medium text-foreground">No reviews yet</h4>
          <p className="mt-1 text-xs text-muted-foreground max-w-sm mx-auto">
            Be the first patient to share feedback on the consultation and hospital facilities.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setFormOpen(true)}
            className="mt-4 gap-1.5"
          >
            <Star className="size-3.5 fill-amber-400 text-amber-500" />
            Write the First Review
          </Button>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {data.reviews.map((r) => (
            <div
              key={r.id}
              className="rounded-lg border bg-card p-4 shadow-2xs space-y-2 flex flex-col justify-between"
            >
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center text-amber-500">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <Star
                        key={star}
                        className={`size-3.5 ${
                          star <= r.rating
                            ? "fill-amber-400 text-amber-500"
                            : "fill-muted text-muted-foreground/30"
                        }`}
                      />
                    ))}
                    <span className="ml-2 text-xs font-semibold text-foreground">{r.rating}.0</span>
                  </div>

                  {r.isVerifiedPatient ? (
                    <Badge tone="success" className="text-[10px]">
                      Verified Patient
                    </Badge>
                  ) : null}
                </div>

                {r.reviewText ? (
                  <p className="text-sm text-foreground/90 leading-relaxed font-normal">
                    &ldquo;{r.reviewText}&rdquo;
                  </p>
                ) : (
                  <p className="text-xs italic text-muted-foreground">Rating only</p>
                )}
              </div>

              <div className="flex items-center justify-between pt-2 border-t text-[11px] text-muted-foreground">
                <span className="font-medium text-slate-700 dark:text-slate-300">{r.patientName}</span>
                <span>{new Date(r.createdAt).toLocaleDateString("en-IN", { month: "short", day: "numeric", year: "numeric" })}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
