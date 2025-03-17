/** @odoo-module */

import { registry } from "@web/core/registry";
import { ProjectTaskButton } from "./project_task_button";

registry.category("pos_buttons").add("project_task_button", {
    component: ProjectTaskButton,
    condition: (env) => env.pos.config.enable_project_integration && env.pos.config.project_id,
    position: ["before", "payment"],
}); 