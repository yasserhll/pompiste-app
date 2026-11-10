<?php

namespace App\Models\Fuel;

use App\Models\Site;
use App\Models\User;
use App\Models\Vehicle;
use Illuminate\Database\Eloquent\Model;

class FuelTank extends Model
{
    use \App\Models\Concerns\LocalDates;

    protected $fillable = [
        'site_id', 'vehicle_id', 'code', 'name', 'kind', 'capacity_l', 'initial_stock_l',
        'initial_stock_at', 'low_stock_threshold_l', 'allow_negative', 'legacy_source', 'is_active',
    ];

    // current_stock_l et last_voucher_seq ne sont jamais assignables en masse :
    // ils ne changent que par StockService / RefuelService, sous verrou.
    protected $casts = [
        'capacity_l' => 'decimal:2',
        'initial_stock_l' => 'decimal:2',
        'current_stock_l' => 'decimal:2',
        'low_stock_threshold_l' => 'decimal:2',
        'initial_stock_at' => 'datetime',
        'allow_negative' => 'boolean',
        'is_active' => 'boolean',
    ];

    public function site()        { return $this->belongsTo(Site::class); }
    public function vehicle()     { return $this->belongsTo(Vehicle::class); }
    public function dispensers()  { return $this->hasMany(FuelDispenser::class); }
    public function movements()   { return $this->hasMany(FuelStockMovement::class); }
    public function refuels()     { return $this->hasMany(FuelRefuel::class); }
    public function deliveries()  { return $this->hasMany(FuelDelivery::class); }
    public function inventories() { return $this->hasMany(FuelInventory::class); }
    public function users()       { return $this->belongsToMany(User::class); }

    public function isLow(): bool
    {
        return $this->low_stock_threshold_l !== null
            && bccomp((string) $this->current_stock_l, (string) $this->low_stock_threshold_l, 2) <= 0;
    }
}
