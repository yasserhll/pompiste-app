<?php

namespace Tests\Unit;

use App\Services\Fuel\Num;
use Illuminate\Validation\ValidationException;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class NumTest extends TestCase
{
    public static function valid(): array
    {
        return [
            'séries manuscrites avec espace' => ['66 4508', '664508.00'],
            'compteur 3 808' => ['3 808', '3808.00'],
            'décimale virgule' => ['334,4', '334.40'],
            'décimale point' => ['273.25', '273.25'],
            'milliers point + décimale virgule' => ['1.234,5', '1234.50'],
            'milliers virgule + décimale point' => ['1,234.5', '1234.50'],
            'groupes de milliers' => ['1.234.567', '1234567.00'],
            'espace insécable' => ["66\u{00A0}4735", '664735.00'],
            'entier' => ['227', '227.00'],
        ];
    }

    #[DataProvider('valid')]
    public function test_parse_valid(string $in, string $out): void
    {
        $this->assertSame($out, Num::parse($in, 'x'));
    }

    public static function invalid(): array
    {
        return [['664,508'], ['12.345'], ['abc'], ['1,2,3.4.5'], ['3.141'], ['']];
    }

    #[DataProvider('invalid')]
    public function test_parse_rejects_ambiguous_or_invalid(string $in): void
    {
        $this->expectException(ValidationException::class);
        Num::parse($in, 'x');
    }

    public function test_exact_arithmetic(): void
    {
        $this->assertSame('227.00', Num::sub('664735', '664508'));
        $this->assertSame('0.30', Num::add('0.1', '0.2'));
    }
}
