<?php

namespace App\Models\Fuel;

use App\Models\Driver;
use App\Models\Site;
use App\Models\User;
use App\Models\Vehicle;
use App\Models\WorkShift;
use Illuminate\Database\Eloquent\Model;

/**
 * Bon de ravitaillement. Une fois créé, il n'est jamais modifié ni supprimé :
 * seule l'annulation (avec mouvement compensatoire) change son statut.
 */
class FuelRefuel extends Model
{
    use \App\Models\Concerns\LocalDates;

    protected $guarded = ['id'];

    protected $casts = [
        'refueled_at' => 'datetime',
        'work_date' => 'date:Y-m-d',
        'snapshot' => 'array',
        'index_start' => 'decimal:2',
        'index_end' => 'decimal:2',
        'quantity_l' => 'decimal:2',
        'declared_quantity_l' => 'decimal:2',
        'expected_index_start' => 'decimal:2',
        'counter_value' => 'decimal:2',
        'previous_counter_value' => 'decimal:2',
        'stock_before_l' => 'decimal:2',
        'stock_after_l' => 'decimal:2',
        'has_anomaly' => 'boolean',
        'cancelled_at' => 'datetime',
    ];

    public function tank()          { return $this->belongsTo(FuelTank::class, 'fuel_tank_id'); }
    public function dispenser()     { return $this->belongsTo(FuelDispenser::class, 'fuel_dispenser_id'); }
    public function vehicle()       { return $this->belongsTo(Vehicle::class); }
    public function driver()        { return $this->belongsTo(Driver::class); }
    public function shift()         { return $this->belongsTo(WorkShift::class, 'work_shift_id'); }
    public function site()          { return $this->belongsTo(Site::class); }
    public function pumpAttendant() { return $this->belongsTo(User::class, 'pump_attendant_id'); }
    public function attachments()   { return $this->morphMany(FuelAttachment::class, 'attachable'); }
    public function anomalies()     { return $this->hasMany(FuelAnomaly::class); }
    public function corrections()   { return $this->hasMany(FuelCorrectionRequest::class); }
    public function corrects()      { return $this->belongsTo(self::class, 'corrects_refuel_id'); }
    public function transferTank()  { return $this->belongsTo(FuelTank::class, 'transfer_to_tank_id'); }
    public function auditLogs()     { return $this->morphMany(FuelAuditLog::class, 'auditable'); }

    public function scopeValid($q) { return $q->where('status', 'valide'); }
}
