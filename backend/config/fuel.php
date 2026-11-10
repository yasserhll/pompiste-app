<?php

// Module gasoil. Les valeurs de `defaults` sont modifiables par l'administrateur
// (table fuel_settings, écran Paramètres) ; ce fichier ne donne que les valeurs initiales.
return [
    'timezone' => env('FUEL_TIMEZONE', 'Africa/Casablanca'),

    // URL ouverte par un appareil photo standard qui scanne le QR (route React /scan/:token)
    'qr_base_url' => env('FUEL_QR_BASE_URL', rtrim(env('FRONTEND_URL', 'http://localhost:5173'), '/') . '/scan'),

    // Disque privé des justificatifs (jamais "public")
    'attachments_disk' => env('FUEL_ATTACHMENTS_DISK', 'local'),
    'attachment_max_kb' => 8192,

    'defaults' => [
        // Sociétés cochées sur le bon papier (TRANSWIN / LAHLAL / LEL / AUTRES)
        'companies' => ['TRANSWIN', 'LAHLAL', 'LEL'],
        // Remplissage d'un camion-citerne : au-delà de ce volume, c'est un transfert de citerne à citerne
        // (en dessous, le plein de son propre moteur) — même règle que les fichiers LOUTA
        'transfer_min_litres' => 500,
        // Rapports mensuels : 27 → 26 (mettre 1 pour le mois calendaire)
        'report_month_start_day' => 27,
        // Seuil de stock faible par défaut (si la citerne n'en définit pas)
        'low_stock_threshold_l' => 1000,
        // Écart toléré entre quantité annoncée et quantité calculée (L)
        'declared_quantity_tolerance_l' => 2,
        // Quantité anormale pour un plein si la capacité du réservoir est inconnue (L)
        'max_refuel_l' => 1000,
        // Marge acceptée au-dessus de la capacité connue du réservoir (%)
        'tank_capacity_margin_pct' => 5,
        // Un même véhicule ravitaillé à nouveau dans ce délai = doublon probable (minutes)
        'duplicate_window_minutes' => 30,
        // Saut de compteur jugé anormal entre deux pleins
        'max_counter_jump_h' => 200,
        'max_counter_jump_km' => 3000,
    ],
];
