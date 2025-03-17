# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import models, api, fields, _

class PosOrder(models.Model):
    _inherit = 'pos.order'

    project_task_ids = fields.Many2many('project.task', string='Tareas Creadas', readonly=True)
    
    @api.model
    def _process_order(self, order, draft, existing_order):
        """Extiende el método _process_order para crear tareas en proyectos"""
        result = super(PosOrder, self)._process_order(order, draft, existing_order)
        
        if result:
            order_id = self.browse(result)
            if order_id.config_id.enable_project_integration and order_id.config_id.project_id:
                self._create_project_task(order_id)
                
        return result
    
    def _create_project_task(self, order):
        """Crea una tarea en el proyecto configurado con la información de la orden"""
        if not order or not order.config_id.enable_project_integration or not order.config_id.project_id:
            return
            
        # Preparar descripción de la tarea
        description = self._prepare_task_description(order)
        
        # Crear la tarea
        task = self.env['project.task'].create({
            'name': _('Pedido %s', order.name),
            'project_id': order.config_id.project_id.id,
            'description': description,
            'user_id': self.env.user.id,
            'date_deadline': fields.Date.today(),
            'partner_id': order.partner_id and order.partner_id.id or False,
        })
        
        # Actualizar la orden con la tarea creada
        order.write({'project_task_ids': [(4, task.id)]})
        
        return task.id
    
    def _prepare_task_description(self, order):
        """Prepara la descripción detallada para la tarea"""
        description = _('<h3>Pedido: %s</h3>', order.name)
        
        # Información del cliente
        if order.partner_id:
            description += _('<p><strong>Cliente:</strong> %s</p>', order.partner_id.name)
        
        # Fecha y hora
        description += _('<p><strong>Fecha:</strong> %s</p>', fields.Datetime.to_string(order.date_order))
        
        # Productos
        description += _('<h4>Productos:</h4><ul>')
        for line in order.lines:
            note = ''
            if line.note:
                note = _(' - Nota: %s', line.note)
            description += _('<li>%s x %s%s</li>', line.qty, line.product_id.name, note)
        description += _('</ul>')
        
        # Notas generales
        if order.note:
            description += _('<h4>Notas adicionales:</h4><p>%s</p>', order.note)
            
        return description 