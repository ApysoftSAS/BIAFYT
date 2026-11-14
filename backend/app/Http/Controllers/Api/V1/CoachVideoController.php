<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\CoachVideo;
use App\Models\GymAssignment;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

/**
 * Coach video showcase ("vitrina"). A coach pastes links to their TikTok
 * videos; every signed-in BIAFYT user can browse them. Nothing is fetched
 * from TikTok and no video is stored — only the username + video id parsed
 * from the URL, for the official embed player.
 */
class CoachVideoController extends Controller
{
    /** Full TikTok video URL: https://www.tiktok.com/@{username}/video/{id}. */
    private const URL_PATTERN = '~^https?://(?:www\.|m\.)?tiktok\.com/@([A-Za-z0-9._]{2,24})/video/(\d{8,25})(?:[/?#].*)?$~';

    private const MAX_PER_COACH = 30;

    /**
     * The showcase: videos of every user who currently holds an active
     * coach role, newest first. Visible to any authenticated user.
     */
    public function index(): JsonResponse
    {
        // ponytail: hard cap instead of pagination; switch to the cursor
        // pagination used by GET /me/points when the showcase outgrows it.
        $videos = CoachVideo::with('coach:id,name')
            ->whereIn('coach_user_id', $this->activeCoachIds())
            ->orderByDesc('id')
            ->limit(200)
            ->get()
            ->map(fn (CoachVideo $video) => $this->map($video) + [
                'coach' => ['id' => $video->coach->id, 'name' => $video->coach->name],
            ])
            ->values();

        return response()->json(['videos' => $videos]);
    }

    /**
     * The authenticated coach's own videos, newest first.
     */
    public function mine(Request $request): JsonResponse
    {
        $videos = CoachVideo::where('coach_user_id', $request->user()->id)
            ->orderByDesc('id')
            ->get()
            ->map(fn (CoachVideo $video) => $this->map($video))
            ->values();

        return response()->json(['videos' => $videos]);
    }

    /**
     * Publish a video. Requires an active coach role (same gate as
     * requesting an athlete). `coach_user_id` always comes from the token.
     */
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'url' => ['required', 'string', 'max:500'],
            'title' => ['required', 'string', 'max:150'],
        ]);

        $coachUserId = $request->user()->id;

        if (! $this->activeCoachIds()->where('user_id', $coachUserId)->exists()) {
            throw ValidationException::withMessages([
                'url' => ['You must have an active coach gym assignment to publish videos.'],
            ]);
        }

        if (! preg_match(self::URL_PATTERN, trim($validated['url']), $matches)) {
            throw ValidationException::withMessages([
                'url' => ['Use the full TikTok video link: https://www.tiktok.com/@user/video/123…'],
            ]);
        }

        $own = CoachVideo::where('coach_user_id', $coachUserId);

        if ((clone $own)->where('tiktok_video_id', $matches[2])->exists()) {
            throw ValidationException::withMessages(['url' => ['You already published this video.']]);
        }

        if ($own->count() >= self::MAX_PER_COACH) {
            throw ValidationException::withMessages([
                'url' => ['You reached the limit of '.self::MAX_PER_COACH.' videos. Remove one first.'],
            ]);
        }

        $video = CoachVideo::create([
            'coach_user_id' => $coachUserId,
            'tiktok_username' => $matches[1],
            'tiktok_video_id' => $matches[2],
            'title' => $validated['title'],
        ]);

        return response()->json(['video' => $this->map($video)], 201);
    }

    /**
     * Remove one of the authenticated coach's own videos (404 otherwise).
     */
    public function destroy(Request $request, int $video): JsonResponse
    {
        CoachVideo::where('coach_user_id', $request->user()->id)->findOrFail($video)->delete();

        return response()->json(null, 204);
    }

    private function activeCoachIds()
    {
        return GymAssignment::where('role', GymAssignment::ROLE_COACH)
            ->where('status', GymAssignment::STATUS_ACTIVE)
            ->select('user_id');
    }

    /**
     * @return array<string, mixed>
     */
    private function map(CoachVideo $video): array
    {
        return [
            'id' => $video->id,
            'title' => $video->title,
            'tiktok_username' => $video->tiktok_username,
            'tiktok_video_id' => $video->tiktok_video_id,
            'created_at' => $video->created_at,
        ];
    }
}
