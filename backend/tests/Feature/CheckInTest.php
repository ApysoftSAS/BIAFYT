<?php

namespace Tests\Feature;

use App\Models\CheckIn;
use App\Models\PointTransaction;
use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

class CheckInTest extends TestCase
{
    use RefreshDatabase;

    // 1. CheckIn pertenece a un user; check_in_date es string Y-m-d, checked_in_at es Carbon.
    public function test_check_in_belongs_to_user_and_field_types(): void
    {
        $user = User::factory()->create();
        $checkIn = CheckIn::create([
            'user_id' => $user->id,
            'check_in_date' => '2026-08-28',
            'checked_in_at' => '2026-08-28 10:00:00',
        ])->fresh();

        $this->assertTrue($checkIn->user->is($user));
        $this->assertSame('2026-08-28', $checkIn->check_in_date);
        $this->assertInstanceOf(Carbon::class, $checkIn->checked_in_at);
        $this->assertNull($checkIn->checked_out_at);
    }

    // 2. UNIQUE(user_id, check_in_date): dos check-ins el mismo día para el mismo user -> rechazado por la BD.
    public function test_unique_user_id_check_in_date_rejects_a_second_check_in_same_day(): void
    {
        $user = User::factory()->create();
        CheckIn::create(['user_id' => $user->id, 'check_in_date' => '2026-08-28', 'checked_in_at' => now()]);

        $this->expectException(QueryException::class);

        CheckIn::create(['user_id' => $user->id, 'check_in_date' => '2026-08-28', 'checked_in_at' => now()]);
    }

    // 3. El mismo día es válido para usuarios distintos.
    public function test_two_users_can_check_in_on_the_same_day(): void
    {
        $a = User::factory()->create();
        $b = User::factory()->create();

        CheckIn::create(['user_id' => $a->id, 'check_in_date' => '2026-08-28', 'checked_in_at' => now()]);
        CheckIn::create(['user_id' => $b->id, 'check_in_date' => '2026-08-28', 'checked_in_at' => now()]);

        $this->assertSame(2, CheckIn::count());
    }

    // 4. Días distintos son válidos para el mismo user.
    public function test_same_user_can_check_in_on_different_days(): void
    {
        $user = User::factory()->create();
        $user->checkIns()->create(['check_in_date' => '2026-08-27', 'checked_in_at' => now()]);
        $user->checkIns()->create(['check_in_date' => '2026-08-28', 'checked_in_at' => now()]);

        $this->assertSame(2, $user->checkIns()->count());
    }

    // 5. Borrar el user arrastra en cascada sus check-ins.
    public function test_deleting_the_user_cascades_their_check_ins(): void
    {
        $user = User::factory()->create();
        CheckIn::create(['user_id' => $user->id, 'check_in_date' => '2026-08-28', 'checked_in_at' => now()]);

        $user->delete();

        $this->assertSame(0, CheckIn::count());
    }

    // 6. La relación morfológica pointTransactions() resuelve; source() apunta de vuelta al CheckIn.
    public function test_point_transactions_morph_relation_resolves(): void
    {
        $user = User::factory()->create();
        $checkIn = CheckIn::create(['user_id' => $user->id, 'check_in_date' => '2026-08-28', 'checked_in_at' => now()]);
        $tx = $checkIn->pointTransactions()->create([
            'user_id' => $user->id,
            'amount' => 20,
            'reason' => PointTransaction::REASON_CHECKIN,
            'idempotency_key' => "checkin:{$user->id}:2026-08-28",
        ]);

        $this->assertSame(1, $checkIn->pointTransactions()->count());
        $this->assertTrue($tx->fresh()->source->is($checkIn));
    }

    // 7. El ledger es compartido: un `checkin` y un `workout_completed` conviven y suman al mismo balance.
    public function test_checkin_and_workout_credits_share_the_same_balance(): void
    {
        $user = User::factory()->create();
        $user->pointTransactions()->createMany([
            ['amount' => 20, 'reason' => PointTransaction::REASON_CHECKIN, 'idempotency_key' => 'checkin:1:2026-08-28'],
            ['amount' => 180, 'reason' => PointTransaction::REASON_WORKOUT_COMPLETED, 'idempotency_key' => 'activity:1'],
        ]);

        $this->assertSame(200, (int) $user->pointTransactions()->sum('amount'));
    }
}
