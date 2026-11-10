<?php

namespace App\Services\Fuel;

use Illuminate\Validation\ValidationException;

/**
 * Nombres du module gasoil : normalisation des saisies (séries manuscrites, compteurs)
 * et calculs exacts en chaînes décimales (bcmath, 2 décimales) — jamais en float.
 */
final class Num
{
    public const SCALE = 2;

    /**
     * Normalise une saisie : « 66 4508 » → "664508.00", « 3 808,5 » → "3808.50",
     * « 1.234,5 » → "1234.50". Un séparateur unique suivi de exactement 3 chiffres
     * (« 664,508 ») est ambigu (milliers ou décimales ?) : la saisie est refusée.
     *
     * @throws ValidationException
     */
    public static function parse(mixed $raw, string $field, bool $allowNull = false): ?string
    {
        if ($raw === null || (is_string($raw) && trim($raw) === '')) {
            if ($allowNull) return null;
            throw ValidationException::withMessages([$field => ['Valeur obligatoire.']]);
        }
        if (is_int($raw)) return self::fmt((string) $raw);
        if (is_float($raw)) {
            throw ValidationException::withMessages([$field => ['Envoyer la valeur sous forme de texte (précision).']]);
        }

        $s = preg_replace('/[\s\x{00A0}\x{202F}\'’_]/u', '', (string) $raw);
        $negative = str_starts_with($s, '-');
        if ($negative) $s = substr($s, 1);

        if (!preg_match('/^[0-9.,]+$/', $s) || !preg_match('/[0-9]/', $s)) {
            throw ValidationException::withMessages([$field => ["« {$raw} » n'est pas un nombre valide."]]);
        }

        $dots = substr_count($s, '.');
        $commas = substr_count($s, ',');

        if ($dots && $commas) {
            // Le dernier séparateur est le séparateur décimal, l'autre sert aux milliers
            $dec = strrpos($s, '.') > strrpos($s, ',') ? '.' : ',';
            $thousands = $dec === '.' ? ',' : '.';
            if (substr_count($s, $dec) > 1) {
                throw ValidationException::withMessages([$field => ["« {$raw} » : séparateurs incohérents."]]);
            }
            $s = str_replace($thousands, '', $s);
            $s = str_replace($dec, '.', $s);
        } elseif ($dots + $commas > 1) {
            // Plusieurs fois le même séparateur : séparateur de milliers (1.234.567)
            $sep = $dots ? '.' : ',';
            if (!preg_match('/^\d{1,3}(' . preg_quote($sep, '/') . '\d{3})+$/', $s)) {
                throw ValidationException::withMessages([$field => ["« {$raw} » : séparateurs incohérents."]]);
            }
            $s = str_replace($sep, '', $s);
        } elseif ($dots + $commas === 1) {
            $sep = $dots ? '.' : ',';
            [$int, $frac] = explode($sep, $s);
            if (strlen($frac) === 3 && $int !== '' && $int !== '0') {
                throw ValidationException::withMessages([$field => [
                    "« {$raw} » est ambigu (milliers ou décimales ?). Saisir sans séparateur, ou avec 1 ou 2 décimales.",
                ]]);
            }
            if (strlen($frac) > self::SCALE) {
                throw ValidationException::withMessages([$field => ['Maximum 2 décimales.']]);
            }
            $s = ($int === '' ? '0' : $int) . '.' . ($frac === '' ? '0' : $frac);
        }

        if (strlen(explode('.', $s)[0]) > 12) {
            throw ValidationException::withMessages([$field => ['Valeur trop grande.']]);
        }

        return self::fmt(($negative ? '-' : '') . $s);
    }

    public static function fmt(string|int|float|null $v): string
    {
        return bcadd((string) ($v ?? '0'), '0', self::SCALE);
    }

    public static function add(string $a, string $b): string { return bcadd($a, $b, self::SCALE); }
    public static function sub(string $a, string $b): string { return bcsub($a, $b, self::SCALE); }
    public static function mul(string $a, string $b): string { return bcmul($a, $b, self::SCALE); }
    public static function cmp(string $a, string $b): int    { return bccomp($a, $b, self::SCALE); }
    public static function neg(string $a): string            { return bcmul($a, '-1', self::SCALE); }
    public static function isZero(string $a): bool           { return bccomp($a, '0', self::SCALE) === 0; }
    public static function abs(string $a): string            { return bccomp($a, '0', self::SCALE) < 0 ? self::neg($a) : self::fmt($a); }

    /** Pour l'affichage / Excel uniquement. */
    public static function toFloat(?string $a): ?float { return $a === null ? null : (float) $a; }
}
