<?php

namespace App\Services\Fuel;

use App\Models\Fuel\FuelAuditLog;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;

class AuditLogger
{
    public function log(?User $user, string $action, ?Model $subject = null, ?array $old = null, ?array $new = null): FuelAuditLog
    {
        $req = request();
        return FuelAuditLog::create([
            'user_id' => $user?->id,
            'action' => $action,
            'auditable_type' => $subject ? $subject->getMorphClass() : null,
            'auditable_id' => $subject?->getKey(),
            'old_values' => $old,
            'new_values' => $new,
            'ip' => $req?->ip(),
            'user_agent' => $req ? substr((string) $req->userAgent(), 0, 255) : null,
        ]);
    }
}
