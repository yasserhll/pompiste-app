<?php

namespace App\Services\Fuel;

use Illuminate\Support\Facades\Storage;

/** Miniature JPEG (largeur 360 px) des photos justificatives, pour les listes. L'original est conservé intact. */
class Thumbnailer
{
    public function make(string $disk, string $path, string $mime): ?string
    {
        if (!function_exists('imagecreatefromstring') || !in_array($mime, ['image/jpeg', 'image/png', 'image/webp'], true)) {
            return null; // HEIC, PDF… : pas de miniature, l'interface affiche une icône
        }
        try {
            $src = @imagecreatefromstring(Storage::disk($disk)->get($path));
            if (!$src) return null;
            if ($mime === 'image/jpeg' && function_exists('exif_read_data')) {
                $src = $this->orient($src, Storage::disk($disk)->path($path));
            }
            $w = imagesx($src);
            $h = imagesy($src);
            $tw = min(360, $w);
            $th = (int) round($h * $tw / max(1, $w));
            $dst = imagecreatetruecolor($tw, $th);
            imagecopyresampled($dst, $src, 0, 0, 0, 0, $tw, $th, $w, $h);
            ob_start();
            imagejpeg($dst, null, 72);
            $bytes = ob_get_clean();
            imagedestroy($src);
            imagedestroy($dst);
            $thumb = preg_replace('/\.[^.\/]+$/', '', $path) . '_thumb.jpg';
            Storage::disk($disk)->put($thumb, $bytes);
            return $thumb;
        } catch (\Throwable) {
            return null;
        }
    }

    /** Photos de téléphone : applique la rotation EXIF pour que la miniature soit droite. */
    private function orient(\GdImage $img, string $file): \GdImage
    {
        $o = @exif_read_data($file)['Orientation'] ?? 1;
        return match ((int) $o) {
            3 => imagerotate($img, 180, 0),
            6 => imagerotate($img, -90, 0),
            8 => imagerotate($img, 90, 0),
            default => $img,
        };
    }
}
