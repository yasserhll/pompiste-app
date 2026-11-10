<?php

use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\Fuel\ControlController;
use App\Http\Controllers\Api\Fuel\DashboardController;
use App\Http\Controllers\Api\Fuel\QrCodeController;
use App\Http\Controllers\Api\Fuel\ReferenceController;
use App\Http\Controllers\Api\Fuel\RefuelController;
use App\Http\Controllers\Api\Fuel\ReportController;
use App\Http\Controllers\Api\Fuel\SettingsController;
use App\Http\Controllers\Api\Fuel\StockEntryController;
use App\Http\Controllers\Api\Fuel\TankController;
use App\Http\Controllers\Api\UserController;
use Illuminate\Support\Facades\Route;

// Toutes les autorisations (rôle + périmètre site/citerne) sont vérifiées dans les contrôleurs
// via App\Services\Fuel\FuelAccess — jamais uniquement côté React.

Route::post('/login', [AuthController::class, 'login'])->middleware('throttle:20,1');

Route::middleware('auth:sanctum')->group(function () {
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::get('/me', [AuthController::class, 'me']);

    // Utilisateurs (admin)
    Route::get('/users', [UserController::class, 'index']);
    Route::post('/users', [UserController::class, 'store']);
    Route::put('/users/{id}', [UserController::class, 'update']);

    // Référentiel
    Route::get('/sites', [ReferenceController::class, 'sites']);
    Route::post('/sites', [ReferenceController::class, 'storeSite']);
    Route::put('/sites/{id}', [ReferenceController::class, 'updateSite']);
    Route::get('/vehicles', [ReferenceController::class, 'vehicles']);
    Route::post('/vehicles', [ReferenceController::class, 'storeVehicle']);
    Route::get('/vehicles/{id}', [ReferenceController::class, 'showVehicle']);
    Route::put('/vehicles/{id}', [ReferenceController::class, 'updateVehicle']);
    Route::get('/drivers', [ReferenceController::class, 'drivers']);
    Route::post('/drivers', [ReferenceController::class, 'storeDriver']);
    Route::put('/drivers/{id}', [ReferenceController::class, 'updateDriver']);
    Route::get('/shifts', [ReferenceController::class, 'shifts']);
    Route::post('/shifts', [ReferenceController::class, 'saveShift']);
    Route::put('/shifts/{id}', [ReferenceController::class, 'saveShift']);
    Route::get('/assignments', [ReferenceController::class, 'assignments']);
    Route::post('/assignments', [ReferenceController::class, 'storeAssignment']);
    Route::post('/assignments/{id}/end', [ReferenceController::class, 'endAssignment']);

    // QR codes
    Route::post('/qr-codes/generate', [QrCodeController::class, 'generate']);
    Route::post('/qr-codes/labels', [QrCodeController::class, 'labels']);
    Route::get('/qr-codes/{vehicleId}/png', [QrCodeController::class, 'png']);
    Route::post('/qr-codes/{vehicleId}/regenerate', [QrCodeController::class, 'regenerate']);
    Route::post('/qr-codes/{vehicleId}/revoke', [QrCodeController::class, 'revoke']);

    // Citernes et compteurs de distribution
    Route::get('/tanks', [TankController::class, 'index']);
    Route::post('/tanks', [TankController::class, 'store']);
    Route::get('/tanks/{id}', [TankController::class, 'show']);
    Route::put('/tanks/{id}', [TankController::class, 'update']);
    Route::get('/tanks/{id}/movements', [TankController::class, 'movements']);
    Route::get('/tanks/{id}/ledger', [TankController::class, 'ledger']);
    Route::get('/tanks/{id}/verify', [TankController::class, 'verify']);
    Route::put('/tanks/{id}/users', [TankController::class, 'syncUsers']);
    Route::post('/tanks/{id}/dispensers', [TankController::class, 'storeDispenser']);
    Route::put('/dispensers/{id}', [TankController::class, 'updateDispenser']);
    Route::post('/dispensers/{id}/reset', [TankController::class, 'resetDispenser']);

    // Ravitaillements (pompiste)
    Route::post('/scan', [RefuelController::class, 'scan']);
    Route::get('/refuels', [RefuelController::class, 'index']);
    Route::post('/refuels/preview', [RefuelController::class, 'preview']);
    Route::post('/refuels', [RefuelController::class, 'store'])->middleware('throttle:60,1');
    Route::get('/refuels/{id}', [RefuelController::class, 'show']);
    Route::get('/refuels/{id}/voucher', [RefuelController::class, 'voucherPdf']);
    Route::post('/refuels/{id}/cancel', [RefuelController::class, 'cancel']);
    Route::post('/refuels/{id}/corrections', [ControlController::class, 'requestCorrection']);

    // Justificatifs (stockage privé)
    Route::post('/attachments', [ControlController::class, 'upload'])->middleware('throttle:120,1');
    Route::get('/attachments/{id}', [ControlController::class, 'download']);

    // Entrées, inventaires, ajustements
    Route::get('/deliveries', [StockEntryController::class, 'deliveries']);
    Route::post('/deliveries', [StockEntryController::class, 'storeDelivery']);
    Route::post('/deliveries/{id}/cancel', [StockEntryController::class, 'cancelDelivery']);
    Route::get('/inventories', [StockEntryController::class, 'inventories']);
    Route::post('/inventories', [StockEntryController::class, 'storeInventory']);
    Route::post('/inventories/{id}/review', [StockEntryController::class, 'reviewInventory']);
    Route::get('/adjustments', [StockEntryController::class, 'adjustments']);
    Route::post('/adjustments', [StockEntryController::class, 'storeAdjustment']);
    Route::post('/adjustments/{id}/review', [StockEntryController::class, 'reviewAdjustment']);

    // Contrôle
    Route::get('/anomalies', [ControlController::class, 'anomalies']);
    Route::put('/anomalies/{id}', [ControlController::class, 'updateAnomaly']);
    Route::get('/corrections', [ControlController::class, 'corrections']);
    Route::post('/corrections/{id}/review', [ControlController::class, 'reviewCorrection']);

    // Tableau de bord, rapports, paramètres
    Route::get('/dashboard', [DashboardController::class, 'summary']);
    Route::get('/dashboard/stock-history', [DashboardController::class, 'stockHistory']);
    Route::get('/reports/export', [ReportController::class, 'export']);
    Route::get('/settings', [SettingsController::class, 'index']);
    Route::put('/settings', [SettingsController::class, 'update']);
    Route::get('/audit-logs', [SettingsController::class, 'audit']);
});
