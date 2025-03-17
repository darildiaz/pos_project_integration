# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import http
from odoo.http import request
import json
from datetime import datetime
import logging
import re
import random

_logger = logging.getLogger(__name__)

class PosProjectController(http.Controller):
    
    @http.route('/pos_project_integration/create_task', type='json', auth='user')
    def create_task(self, order_id=None, project_id=None):
        """Crea una tarea en el proyecto configurado para la orden."""
        try:
            _logger.info("Creando tarea para orden %s en proyecto %s", order_id, project_id)
            
            # Obtener la orden
            if not order_id:
                _logger.warning("No se proporcionó ID de orden")
                return {'success': False, 'message': 'No se proporcionó ID de orden'}
            
            order = request.env['pos.order'].sudo().browse(order_id)
            if not order.exists():
                _logger.warning("Orden no encontrada con ID: %s", order_id)
                return {'success': False, 'message': 'Orden no encontrada'}
            
            # Obtener el proyecto
            if project_id:
                _logger.info("Usando proyecto proporcionado: %s", project_id)
            elif order.config_id and order.config_id.project_id:
                project_id = order.config_id.project_id.id
                _logger.info("Usando proyecto de la configuración del TPV: %s", project_id)
            else:
                _logger.warning("No hay proyecto configurado para la orden: %s", order.name)
                return {'success': False, 'message': 'No hay proyecto configurado'}
            
            # Verificar que el proyecto existe
            project = request.env['project.project'].sudo().browse(project_id)
            if not project.exists():
                _logger.warning("Proyecto no encontrado con ID: %s", project_id)
                return {'success': False, 'message': 'Proyecto no encontrado'}
            
            # Crear la descripción de la tarea
            try:
                description = self._prepare_task_description(order)
            except Exception as e:
                _logger.error("Error al preparar la descripción de la tarea: %s", str(e))
                description = f"<p>Pedido: {order.name}</p>"
            
            # Verificar si el modelo project.task tiene el campo user_id o person_id
            task_fields = request.env['project.task'].fields_get()
            _logger.info("Campos disponibles en project.task: %s", list(task_fields.keys()))
            
            # Generar nombre de tarea con formato "Order XXXXX-XXX-XXXX"
            # Intentar extraer el formato si ya existe
            order_name = order.name
            order_name_match = re.search(r'(\d+-\d+-\d+)', order_name)
            
            if order_name_match:
                task_name = f"Order {order_name_match.group(1)}"
            else:
                # Si no tiene el formato, crear uno nuevo basado en la fecha y ID
                current_date = datetime.now().strftime('%y%m%d')
                sequence = str(order.id).zfill(4)
                task_name = f"Order {current_date}-{sequence}"
            
            # Crear la tarea en el proyecto
            task_vals = {
                'name': task_name,
                'project_id': project_id,
                'description': description,
                'date_deadline': order.date_order.date(),
                'partner_id': order.partner_id and order.partner_id.id or False,
            }
            
            # Añadir el campo de usuario responsable según la versión de Odoo
            if 'user_id' in task_fields:
                task_vals['user_id'] = request.env.user.id
            elif 'person_id' in task_fields:
                task_vals['person_id'] = request.env.user.id
            
            _logger.info("Creando tarea con valores: %s", task_vals)
            task = request.env['project.task'].sudo().create(task_vals)
            
            # Actualizar la orden con la tarea creada
            order.sudo().write({'project_task_ids': [(4, task.id)]})
            
            _logger.info("Tarea creada correctamente con ID: %s", task.id)
            return {
                'success': True,
                'message': 'Se creó la tarea correctamente',
                'task_id': task.id
            }
            
        except Exception as e:
            _logger.error("Error al crear la tarea: %s", str(e), exc_info=True)
            return {'success': False, 'message': str(e)}
    
    def _prepare_task_description(self, order):
        """
        Prepara la descripción de la tarea para órdenes finalizadas
        
        :param order: Objeto pos.order
        :return: String con la descripción HTML de la tarea
        """
        description = []
        
        # Añadir encabezado
        description.append(f"<h3>Pedido: {order.name}</h3>")
        
        # Añadir información de mesa si está disponible
        if order.table_id:
            description.append(f"<p><strong>Mesa:</strong> {order.table_id.name}</p>")
        
        # Añadir información de camarero si está disponible
        if order.user_id:
            description.append(f"<p><strong>Atendido por:</strong> {order.user_id.name}</p>")
        
        # Añadir información del cliente si está disponible
        if order.partner_id:
            description.append(f"<p><strong>Cliente:</strong> {order.partner_id.name}</p>")
        
        # Añadir nota general si está disponible
        if hasattr(order, 'note') and order.note:
            description.append(f"<p><strong>Nota general:</strong> {order.note}</p>")
        
        # Añadir líneas de la orden
        if order.lines:
            description.append("<h4>Productos:</h4>")
            description.append("<table width='100%' style='border-collapse: collapse;'>")
            description.append("<tr style='background-color: #f2f2f2;'>")
            description.append("<th style='border: 1px solid #ddd; padding: 8px; text-align: left;'>Producto</th>")
            description.append("<th style='border: 1px solid #ddd; padding: 8px; text-align: center;'>Cantidad</th>")
            description.append("<th style='border: 1px solid #ddd; padding: 8px; text-align: right;'>Precio</th>")
            description.append("<th style='border: 1px solid #ddd; padding: 8px; text-align: left;'>Notas</th>")
            description.append("</tr>")
            
            for line in order.lines:
                description.append("<tr>")
                description.append(f"<td style='border: 1px solid #ddd; padding: 8px;'>{line.product_id.name}</td>")
                description.append(f"<td style='border: 1px solid #ddd; padding: 8px; text-align: center;'>{line.qty}</td>")
                description.append(f"<td style='border: 1px solid #ddd; padding: 8px; text-align: right;'>{line.price_subtotal_incl:.2f}</td>")
                
                # Añadir notas del producto
                note_cell = "<td style='border: 1px solid #ddd; padding: 8px;'>"
                if hasattr(line, 'note') and line.note:
                    note_cell += f"{line.note.replace('\n', '<br/>')}"
                note_cell += "</td>"
                description.append(note_cell)
                
                description.append("</tr>")
            
            # Añadir total
            description.append("<tr style='background-color: #f2f2f2;'>")
            description.append("<td colspan='2' style='border: 1px solid #ddd; padding: 8px; text-align: right;'><strong>Total:</strong></td>")
            description.append(f"<td style='border: 1px solid #ddd; padding: 8px; text-align: right;'><strong>{order.amount_total:.2f}</strong></td>")
            description.append("<td style='border: 1px solid #ddd; padding: 8px;'></td>")
            description.append("</tr>")
            
            description.append("</table>")
        
        # Añadir fecha y hora
        description.append(f"<p><em>Creado el {order.date_order.strftime('%d/%m/%Y')} a las {order.date_order.strftime('%H:%M:%S')}</em></p>")
        
        return "".join(description)
    
    @http.route('/pos_project_integration/create_preparation_task', type='json', auth='user')
    def create_preparation_task(self, order_data=None):
        """Crea una tarea en el proyecto configurado para una orden de preparación."""
        try:
            _logger.info("Creando tarea de preparación con datos: %s", order_data)
            
            if not order_data:
                _logger.warning("No se proporcionaron datos de orden")
                return {'success': False, 'message': 'No se proporcionaron datos de orden'}
            
            # Obtener el proyecto
            project_id = None
            if 'project_id' in order_data and order_data['project_id']:
                project_id = order_data['project_id']
                _logger.info("Tipo de project_id: %s, Valor: %s", type(project_id), project_id)
                
                # Intentar convertir a entero si es un diccionario
                if isinstance(project_id, dict) and 'id' in project_id:
                    project_id = project_id['id']
                
                # Intentar convertir a entero si es una cadena
                if isinstance(project_id, str):
                    try:
                        project_id = int(project_id)
                    except ValueError:
                        _logger.warning("No se pudo convertir project_id a entero: %s", project_id)
            
            if not project_id:
                _logger.warning("No se proporcionó ID de proyecto")
                return {'success': False, 'message': 'No se proporcionó ID de proyecto'}
            
            # Verificar que el proyecto existe
            project = request.env['project.project'].sudo().browse(project_id)
            if not project.exists():
                _logger.warning("Proyecto no encontrado con ID: %s", project_id)
                return {'success': False, 'message': 'Proyecto no encontrado'}
            
            # Crear la descripción de la tarea
            try:
                description = self._prepare_preparation_task_description(order_data)
            except Exception as e:
                _logger.error("Error al preparar la descripción de la tarea: %s", str(e))
                description = f"<p>Preparación: {order_data.get('name', 'Sin nombre')}</p>"
            
            # Verificar si el modelo project.task tiene el campo user_id o person_id
            task_fields = request.env['project.task'].fields_get()
            
            # Generar nombre de tarea con formato "Order XXXXX-XXX-XXXX"
            # Intentar extraer el formato si ya existe en el nombre
            order_name = order_data.get('name', '')
            order_name_match = re.search(r'(\d+-\d+-\d+)', order_name)
            
            if order_name_match:
                task_name = f"Order {order_name_match.group(1)}"
                # Añadir indicador si es reimpresión o pedido agregado
                if '(Reimpresión)' in order_name:
                    task_name += " (Reimpresión)"
                if order_data.get('is_added_order') or '(Agregado)' in order_name:
                    task_name += " (Agregado)"
            else:
                # Si no tiene el formato, crear uno nuevo basado en la fecha y hora
                current_date = datetime.now().strftime('%y%m%d')
                current_time = datetime.now().strftime('%H%M')
                random_num = str(random.randint(1000, 9999))
                task_name = f"Order {current_date}-{current_time}-{random_num}"
                
                # Añadir indicador si es reimpresión o pedido agregado
                if order_data.get('reprint'):
                    task_name += " (Reimpresión)"
                if order_data.get('is_added_order'):
                    task_name += " (Agregado)"
            
            _logger.info("Nombre final de la tarea: %s", task_name)
            
            # Crear la tarea
            task_vals = {
                'name': task_name,
                'project_id': project.id,
                'description': description,
                'date_deadline': datetime.now().date(),
                'partner_id': order_data.get('customer', {}).get('id', False),
            }
            
            # Añadir el campo de usuario responsable según la versión de Odoo
            if 'user_id' in task_fields:
                task_vals['user_id'] = request.env.user.id
            elif 'person_id' in task_fields:
                task_vals['person_id'] = request.env.user.id
            
            _logger.info("Creando tarea de preparación con valores: %s", task_vals)
            task = request.env['project.task'].sudo().create(task_vals)
            
            _logger.info("Tarea de preparación creada correctamente con ID: %s", task.id)
            return {
                'success': True,
                'message': 'Se creó la tarea de preparación correctamente',
                'task_id': task.id
            }
            
        except Exception as e:
            _logger.error("Error al crear la tarea de preparación: %s", str(e), exc_info=True)
            return {'success': False, 'message': str(e)}
    
    def _prepare_preparation_task_description(self, order_data):
        """Prepara la descripción de la tarea para órdenes de preparación."""
        description = '<div style="font-family: Arial, sans-serif; max-width: 800px;">'
        
        # Información del cliente
        if order_data.get('customer'):
            description += f'<div style="margin-bottom: 15px; padding: 10px; background-color: #f8f9fa; border-radius: 5px;">'
            description += f'<h3 style="margin-top: 0; color: #495057;">Cliente: {order_data["customer"].get("name", "Sin nombre")}</h3>'
            description += '</div>'
        
        # Información de mesa y camarero
        table_server_info = []
        if order_data.get('table'):
            table_server_info.append(f'<strong>Mesa:</strong> {order_data["table"]}')
        if order_data.get('server'):
            table_server_info.append(f'<strong>Camarero:</strong> {order_data["server"]}')
        
        if table_server_info:
            description += f'<div style="margin-bottom: 15px; padding: 10px; background-color: #e9ecef; border-radius: 5px;">'
            description += ' | '.join(table_server_info)
            description += '</div>'
        
        # Nota general
        if order_data.get('note') and order_data['note'].strip():
            description += f'<div style="margin-bottom: 15px; padding: 10px; background-color: #fff3cd; border-radius: 5px;">'
            description += f'<h3 style="margin-top: 0; color: #856404;">Nota General:</h3>'
            description += f'<p style="margin-bottom: 0;">{order_data["note"].replace(chr(10), "<br/>")}</p>'
            description += '</div>'
        
        # Productos
        description += '<div style="margin-bottom: 15px;">'
        description += '<h3 style="margin-top: 0; color: #495057;">Productos:</h3>'
        description += '<table style="width: 100%; border-collapse: collapse;">'
        description += '<thead>'
        description += '<tr style="background-color: #6c757d; color: white;">'
        description += '<th style="padding: 8px; text-align: left; border: 1px solid #dee2e6;">Producto</th>'
        description += '<th style="padding: 8px; text-align: center; border: 1px solid #dee2e6;">Cantidad</th>'
        description += '<th style="padding: 8px; text-align: left; border: 1px solid #dee2e6;">Notas</th>'
        description += '</tr>'
        description += '</thead>'
        description += '<tbody>'
        
        for line in order_data.get('order_lines', []):
            # Determinar el estilo de la fila según el tipo de cambio
            row_style = ''
            if line.get('change_type') == 'new':
                row_style = 'background-color: #d4edda;'  # Verde claro para nuevos
            elif line.get('change_type') == 'cancelled':
                row_style = 'background-color: #f8d7da;'  # Rojo claro para cancelados
            elif line.get('change_type') == 'note_only':
                row_style = 'background-color: #fff3cd;'  # Amarillo claro para solo notas
            
            description += f'<tr style="{row_style}">'
            
            # Producto con precio
            product_name = line.get('product_name', 'Sin nombre')
            price = line.get('price', 0)
            description += f'<td style="padding: 8px; border: 1px solid #dee2e6;">'
            description += f'<strong>{product_name}</strong>'
            if price > 0:
                description += f'<br/><span style="font-size: 0.8em; color: #6c757d;">${price:.2f}</span>'
            
            # Mostrar atributos si no están ya en el nombre del producto
            attributes = line.get('attributes', [])
            if attributes and len(attributes) > 0 and '(' not in product_name:
                description += f'<div style="font-size: 0.9em; color: #17a2b8; margin-top: 3px;">{", ".join(attributes)}</div>'
            
            description += '</td>'
            
            # Cantidad - Asegurar que se muestre correctamente
            qty = line.get('qty', 1)
            if isinstance(qty, (int, float)):
                qty_display = f"{qty:.0f}" if qty == int(qty) else f"{qty:.2f}"
            else:
                try:
                    qty_num = float(qty)
                    qty_display = f"{qty_num:.0f}" if qty_num == int(qty_num) else f"{qty_num:.2f}"
                except (ValueError, TypeError):
                    qty_display = "1"  # Valor por defecto si no se puede convertir
            
            description += f'<td style="padding: 8px; text-align: center; border: 1px solid #dee2e6; font-weight: bold; font-size: 1.2em;">{qty_display}</td>'
            
            # Notas
            note = line.get('note', '')
            sides = line.get('sides', [])
            combo_items = line.get('combo_items', [])
            
            description += f'<td style="padding: 8px; border: 1px solid #dee2e6;">'
            
            # Procesar nota principal
            if note:
                # Dividir por líneas para mejor formato
                note_lines = note.split('\n')
                for note_line in note_lines:
                    if note_line.strip():
                        if note_line.startswith('Extras:'):
                            description += f'<div style="color: #3498db; font-weight: bold;">{note_line}</div>'
                        elif note_line.startswith('Combo:'):
                            description += f'<div style="color: #9b59b6; font-weight: bold;">{note_line}</div>'
                        else:
                            description += f'<div style="color: #e74c3c; font-weight: bold;">{note_line}</div>'
            
            # Procesar sides si no están en la nota
            if sides and len(sides) > 0 and 'Extras:' not in note:
                description += '<div style="margin-top: 5px; color: #3498db; font-weight: bold;"><strong>Extras:</strong> '
                if isinstance(sides, list):
                    side_names = []
                    for side in sides:
                        if isinstance(side, str):
                            side_names.append(side)
                        elif isinstance(side, dict) and side.get('name'):
                            side_names.append(side['name'])
                        elif isinstance(side, dict) and side.get('product_name'):
                            side_names.append(side['product_name'])
                    description += ', '.join(side_names)
                else:
                    description += str(sides)
                description += '</div>'
            
            # Procesar combo items si no están en la nota
            if combo_items and len(combo_items) > 0 and 'Combo:' not in note:
                description += '<div style="margin-top: 5px; color: #9b59b6; font-weight: bold;"><strong>Combo:</strong> '
                if isinstance(combo_items, list):
                    combo_names = []
                    for item in combo_items:
                        if isinstance(item, str):
                            combo_names.append(item)
                        elif isinstance(item, dict) and item.get('name'):
                            qty = item.get('quantity', 1)
                            combo_names.append(f"{qty}x {item['name']}")
                    description += ', '.join(combo_names)
                else:
                    description += str(combo_items)
                description += '</div>'
            
            if not note and not sides and not combo_items:
                description += '<span style="color: #6c757d;">Sin notas</span>'
            
            description += '</td>'
            
            description += '</tr>'
        
        description += '</tbody>'
        description += '</table>'
        description += '</div>'
        
        # Información adicional
        description += '<div style="font-size: 0.8em; color: #6c757d; margin-top: 20px; padding-top: 10px; border-top: 1px solid #dee2e6;">'
        description += f'Orden creada: {datetime.now().strftime("%d/%m/%Y %H:%M:%S")}'
        
        # Tipo de orden
        if order_data.get('is_change_order'):
            description += ' | Tipo: Cambio en el pedido'
        elif order_data.get('is_added_order'):
            description += ' | Tipo: Pedido agregado'
        else:
            description += ' | Tipo: Nuevo pedido'
        
        description += '</div>'
        
        description += '</div>'
        return description
        
    def _format_product_note(self, line):
        """Formatea la nota del producto, incluyendo sides y combos"""
        note_html = ''
        
        # Verificar si hay una nota
        if line.get('note') and line.get('note').strip():
            # Dividir la nota por líneas para procesar sides y combos por separado
            note_lines = line['note'].strip().split('\n')
            
            # Procesar cada línea
            formatted_lines = []
            for note_line in note_lines:
                if note_line.startswith('Extras:'):
                    # Formatear extras/sides
                    formatted_lines.append(f'<div style="margin-left: 15px; color: #3498db;"><strong>{note_line}</strong></div>')
                elif note_line.startswith('Combo:'):
                    # Formatear combos
                    formatted_lines.append(f'<div style="margin-left: 15px; color: #9b59b6;"><strong>{note_line}</strong></div>')
                elif '[SOLO NOTA GENERAL]' in note_line:
                    # Ignorar esta línea, ya que es solo un marcador
                    continue
                else:
                    # Nota normal
                    formatted_lines.append(f'<div style="margin-left: 15px; color: #e74c3c;"><strong>Nota:</strong> {note_line}</div>')
            
            # Unir todas las líneas formateadas
            if formatted_lines:
                note_html = '<div style="margin-top: 5px;">' + ''.join(formatted_lines) + '</div>'
        
        return note_html 