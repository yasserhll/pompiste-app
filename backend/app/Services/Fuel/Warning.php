<?php

namespace App\Services\Fuel;

/**
 * Résultat d'un contrôle.
 *   bloquant : l'opération est refusée.
 *   alerte   : l'opérateur doit confirmer ; une anomalie est enregistrée pour le contrôle.
 *   info     : affiché, non enregistré.
 */
final class Warning
{
    public static function block(string $code, string $message, array $data = []): array
    {
        return ['level' => 'bloquant', 'code' => $code, 'message' => $message, 'data' => $data];
    }

    public static function alert(string $code, string $message, array $data = []): array
    {
        return ['level' => 'alerte', 'code' => $code, 'message' => $message, 'data' => $data];
    }

    public static function info(string $code, string $message, array $data = []): array
    {
        return ['level' => 'info', 'code' => $code, 'message' => $message, 'data' => $data];
    }
}
