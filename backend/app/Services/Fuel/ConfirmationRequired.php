<?php

namespace App\Services\Fuel;

use Illuminate\Http\JsonResponse;
use RuntimeException;

/** Des alertes doivent être confirmées par l'opérateur avant l'enregistrement (HTTP 409). */
class ConfirmationRequired extends RuntimeException
{
    public function __construct(public readonly array $warnings)
    {
        parent::__construct('Des contrôles doivent être confirmés avant validation.');
    }

    public function render(): JsonResponse
    {
        return response()->json([
            'message' => $this->getMessage(),
            'requires_confirmation' => true,
            'warnings' => $this->warnings,
        ], 409);
    }
}
