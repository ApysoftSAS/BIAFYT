<?php

namespace Tests\Feature\Api\V1;

use App\Models\CoachVideo;
use App\Models\Gym;
use App\Models\GymAssignment;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Coach video showcase: an active coach publishes TikTok links, every
 * signed-in user sees them.
 */
class CoachVideoApiTest extends TestCase
{
    use RefreshDatabase;

    private const URL = 'https://www.tiktok.com/@carlos.fit/video/7312345678901234567';

    private function makeCoach(string $status = GymAssignment::STATUS_ACTIVE): User
    {
        $coach = User::factory()->create();
        GymAssignment::create([
            'user_id' => $coach->id,
            'gym_id' => Gym::create(['name' => 'Gym '.$coach->id])->id,
            'branch_id' => null,
            'role' => GymAssignment::ROLE_COACH,
            'status' => $status,
        ]);

        return $coach;
    }

    public function test_endpoints_reject_unauthenticated_requests(): void
    {
        $this->getJson('/api/v1/coach-videos')->assertStatus(401);
        $this->postJson('/api/v1/me/coach/videos', [])->assertStatus(401);
    }

    public function test_coach_publishes_a_video_and_any_user_sees_it(): void
    {
        $coach = $this->makeCoach();

        $this->actingAs($coach)
            ->postJson('/api/v1/me/coach/videos', ['url' => self::URL.'?is_from_webapp=1', 'title' => 'Rutina de pecho'])
            ->assertStatus(201)
            ->assertJsonPath('video.tiktok_username', 'carlos.fit')
            ->assertJsonPath('video.tiktok_video_id', '7312345678901234567');

        $this->actingAs($coach)->getJson('/api/v1/me/coach/videos')->assertJsonCount(1, 'videos');

        $this->actingAs(User::factory()->create())
            ->getJson('/api/v1/coach-videos')
            ->assertOk()
            ->assertJsonCount(1, 'videos')
            ->assertJsonPath('videos.0.title', 'Rutina de pecho')
            ->assertJsonPath('videos.0.coach.name', $coach->name)
            ->assertJsonMissingPath('videos.0.coach.email');
    }

    public function test_a_user_without_an_active_coach_role_cannot_publish(): void
    {
        $payload = ['url' => self::URL, 'title' => 'x'];

        $this->actingAs(User::factory()->create())
            ->postJson('/api/v1/me/coach/videos', $payload)->assertStatus(422);
        $this->actingAs($this->makeCoach(GymAssignment::STATUS_INACTIVE))
            ->postJson('/api/v1/me/coach/videos', $payload)->assertStatus(422);

        $this->assertSame(0, CoachVideo::count());
    }

    public function test_invalid_links_and_duplicates_are_rejected(): void
    {
        $coach = $this->makeCoach();

        foreach (['https://vm.tiktok.com/ZMabc123/', 'https://www.youtube.com/watch?v=abc', 'https://evil.com/?https://www.tiktok.com/@a.b/video/7312345678901234567'] as $url) {
            $this->actingAs($coach)->postJson('/api/v1/me/coach/videos', ['url' => $url, 'title' => 'x'])
                ->assertStatus(422)->assertJsonValidationErrors('url');
        }

        $this->actingAs($coach)->postJson('/api/v1/me/coach/videos', ['url' => self::URL, 'title' => 'x'])->assertStatus(201);
        $this->actingAs($coach)->postJson('/api/v1/me/coach/videos', ['url' => self::URL, 'title' => 'y'])->assertStatus(422);
    }

    public function test_showcase_hides_videos_of_coaches_whose_role_was_revoked(): void
    {
        $coach = $this->makeCoach();
        CoachVideo::create(['coach_user_id' => $coach->id, 'tiktok_username' => 'a.b', 'tiktok_video_id' => '12345678', 'title' => 't']);
        GymAssignment::where('user_id', $coach->id)->update(['status' => GymAssignment::STATUS_INACTIVE]);

        $this->actingAs(User::factory()->create())->getJson('/api/v1/coach-videos')->assertJsonCount(0, 'videos');
    }

    public function test_a_coach_deletes_only_their_own_videos(): void
    {
        $coach = $this->makeCoach();
        $video = CoachVideo::create(['coach_user_id' => $coach->id, 'tiktok_username' => 'a.b', 'tiktok_video_id' => '12345678', 'title' => 't']);

        $this->actingAs($this->makeCoach())->deleteJson("/api/v1/me/coach/videos/{$video->id}")->assertStatus(404);
        $this->actingAs($coach)->deleteJson("/api/v1/me/coach/videos/{$video->id}")->assertStatus(204);
        $this->assertSame(0, CoachVideo::count());
    }
}
