# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import fields, models, api
import logging

_logger = logging.getLogger(__name__)

class PosPrinter(models.Model):
    _inherit = 'pos.printer'

    printer_type = fields.Selection(selection_add=[('project', 'Use a project')])
    project_id = fields.Many2one('project.project', string='Project', 
                                help="Project where tasks will be created from POS orders")
    
    @api.model
    def _load_pos_data_fields(self, config_id):
        fields_list = super()._load_pos_data_fields(config_id)
        fields_list.append('project_id')
        _logger.info("Campos cargados para impresoras POS: %s", fields_list)
        return fields_list
    
    def _prepare_printer_data(self):
        data = super()._prepare_printer_data()
        if self.printer_type == 'project' and self.project_id:
            data['project_id'] = self.project_id.read(['id', 'name'])[0]
            _logger.info("Datos de proyecto para impresora %s: %s", self.name, data['project_id'])
        return data
    
    @api.model
    def check_project_printers(self):
        """Verifica y corrige las impresoras de tipo proyecto sin proyecto asignado"""
        project_printers = self.search([('printer_type', '=', 'project')])
        _logger.info("Verificando %s impresoras de tipo proyecto", len(project_printers))
        
        for printer in project_printers:
            _logger.info("Impresora %s (ID: %s) - Tipo: %s - Proyecto: %s", 
                         printer.name, printer.id, printer.printer_type, printer.project_id and printer.project_id.name or "No configurado")
            
            if not printer.project_id:
                # Buscar un proyecto por defecto
                default_project = self.env['project.project'].search([], limit=1)
                if default_project:
                    _logger.info("Asignando proyecto por defecto %s a la impresora %s", 
                                default_project.name, printer.name)
                    printer.project_id = default_project.id
                else:
                    _logger.warning("No se encontró ningún proyecto para asignar a la impresora %s", printer.name)
        
        return {
            'type': 'ir.actions.client',
            'tag': 'display_notification',
            'params': {
                'title': 'Verificación completada',
                'message': f'Se verificaron {len(project_printers)} impresoras de tipo proyecto',
                'sticky': False,
                'type': 'success',
            }
        }
    
    @api.model
    def fix_project_printers_in_database(self):
        """Corrige directamente en la base de datos las impresoras de tipo proyecto"""
        self.env.cr.execute("""
            SELECT id, name, printer_type, project_id
            FROM pos_printer
            WHERE printer_type = 'project'
        """)
        printers = self.env.cr.dictfetchall()
        _logger.info("Encontradas %s impresoras de tipo proyecto en la base de datos", len(printers))
        
        # Buscar un proyecto por defecto
        self.env.cr.execute("SELECT id FROM project_project LIMIT 1")
        project_result = self.env.cr.fetchone()
        
        if not project_result:
            _logger.warning("No se encontró ningún proyecto en la base de datos")
            return {
                'type': 'ir.actions.client',
                'tag': 'display_notification',
                'params': {
                    'title': 'Error',
                    'message': 'No se encontró ningún proyecto en la base de datos',
                    'sticky': False,
                    'type': 'danger',
                }
            }
        
        default_project_id = project_result[0]
        _logger.info("Proyecto por defecto ID: %s", default_project_id)
        
        # Actualizar las impresoras sin proyecto
        for printer in printers:
            if not printer['project_id']:
                _logger.info("Actualizando impresora %s (ID: %s) con proyecto por defecto", 
                            printer['name'], printer['id'])
                self.env.cr.execute("""
                    UPDATE pos_printer
                    SET project_id = %s
                    WHERE id = %s
                """, (default_project_id, printer['id']))
        
        self.env.cr.commit()
        
        return {
            'type': 'ir.actions.client',
            'tag': 'display_notification',
            'params': {
                'title': 'Corrección completada',
                'message': f'Se corrigieron las impresoras de tipo proyecto en la base de datos',
                'sticky': False,
                'type': 'success',
            }
        } 