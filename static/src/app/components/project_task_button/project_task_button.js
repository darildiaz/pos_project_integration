/** @odoo-module */

import { Component } from "@odoo/owl";
import { usePos } from "@point_of_sale/app/store/pos_hook";
import { _t } from "@web/core/l10n/translation";

/**
 * Botón para crear tareas en proyectos desde el POS
 */
export class ProjectTaskButton extends Component {
    static template = "pos_project_integration.ProjectTaskButton";

    setup() {
        this.pos = usePos();
    }

    get isEnabled() {
        return this.pos.config.enable_project_integration && 
               this.pos.config.project_id && 
               this.pos.projectTaskCreator;
    }

    get currentOrder() {
        return this.pos.get_order();
    }

    get hasValidOrder() {
        const order = this.currentOrder;
        return order && order.get_orderlines().length > 0;
    }

    async createTask() {
        if (!this.isEnabled) {
            this.pos.notification.add(_t("La integración con proyectos no está habilitada"), { type: "warning" });
            return;
        }

        if (!this.hasValidOrder) {
            this.pos.notification.add(_t("No hay productos en la orden"), { type: "warning" });
            return;
        }

        try {
            // Primero guardar la orden si no está guardada
            if (!this.currentOrder.backendId) {
                await this.pos.push_single_order(this.currentOrder);
            }

            // Crear la tarea
            if (this.currentOrder.backendId) {
                const result = await this.pos.projectTaskCreator.createTask(this.currentOrder);
                if (result.success) {
                    this.pos.notification.add(_t("Tarea creada correctamente"), { type: "success" });
                } else {
                    this.pos.notification.add(result.message, { type: "warning" });
                }
            } else {
                this.pos.notification.add(_t("No se pudo guardar la orden"), { type: "warning" });
            }
        } catch (error) {
            this.pos.notification.add(_t("Error al crear la tarea"), { type: "danger" });
            console.error("Error al crear la tarea:", error);
        }
    }
} 