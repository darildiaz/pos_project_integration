# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import fields, models, api

class PosConfig(models.Model):
    _inherit = 'pos.config'

    enable_project_integration = fields.Boolean(
        string='Activar Integración con Proyectos',
        default=False,
        help="Habilita la creación automática de tarjetas en proyectos desde las órdenes del POS"
    )
    
    project_id = fields.Many2one(
        'project.project',
        string='Proyecto para Tarjetas',
        help="Proyecto donde se crearán las tarjetas desde las órdenes del POS"
    )
    
    def _loader_params_pos_config(self):
        result = super()._loader_params_pos_config()
        result['search_params']['fields'].extend(['enable_project_integration', 'project_id'])
        return result 