/** @odoo-module */

import { _t } from "@web/core/l10n/translation";
import { rpc } from "@web/core/network/rpc";

/**
 * Clase para manejar la creación de tareas en proyectos desde el POS
 */
export class ProjectTaskCreator {
    /**
     * @param {Object} pos - Instancia del POS
     */
    constructor(pos) {
        this.pos = pos;
    }

    /**
     * Verifica si la integración con proyectos está habilitada
     * @returns {Boolean} - True si está habilitada, False en caso contrario
     */
    isEnabled() {
        return this.pos.config.enable_project_integration && this.pos.config.project_id;
    }

    /**
     * Crea una tarea en el proyecto configurado para la orden actual
     * @param {Object} order - Orden del POS
     * @returns {Promise} - Promesa que se resuelve cuando se crea la tarea
     */
    async createTask(order) {
        if (!this.isEnabled()) {
            return Promise.resolve({ success: false, message: _t("La integración con proyectos no está habilitada") });
        }

        if (!order) {
            return Promise.resolve({ success: false, message: _t("No hay orden seleccionada") });
        }

        try {
            // Preparar datos de la orden
            const orderData = {
                order_id: order.backendId,
                project_id: this.pos.config.project_id[0]
            };

            // Llamar al endpoint para crear la tarea
            const result = await rpc("/pos_project_integration/create_task", { order_data: orderData });
            
            if (result.success) {
                return Promise.resolve({ 
                    success: true, 
                    message: _t("Tarea creada correctamente"),
                    task_id: result.task_id
                });
            } else {
                return Promise.resolve({ 
                    success: false, 
                    message: result.message || _t("Error al crear la tarea")
                });
            }
        } catch (error) {
            console.error("Error al crear la tarea:", error);
            return Promise.resolve({ 
                success: false, 
                message: error.message || _t("Error al crear la tarea")
            });
        }
    }
} 