# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

{
    'name': 'POS Project Integration',
    'version': '1.0',
    'category': 'Sales/Point of Sale',
    'sequence': 6,
    'summary': 'Integración del POS con Proyectos',
    'description': """
Integración entre el Punto de Venta y Proyectos
===============================================

Este módulo permite crear tarjetas en proyectos de Odoo automáticamente
desde las órdenes del Punto de Venta.
""",
    'author': 'Ing Daril Diaz V1.0.1, Claude',
    'depends': ['point_of_sale', 'project'],
    'data': [
        'views/pos_config_views.xml',
        'views/res_config_settings_views.xml',
        'views/pos_printer_views.xml',
    ],
    'installable': True,
    'auto_install': False,
    'assets': {
        'point_of_sale._assets_pos': [
            'pos_project_integration/static/src/**/*',
        ],
    },
    'license': 'LGPL-3',
} 