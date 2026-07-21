from odoo import fields, models


class VlxdCustomer(models.Model):
    _name = "vlxd.customer"
    _description = "VLXD Customer"
    _inherit = ["mail.thread", "mail.activity.mixin"]

    name = fields.Char(required=True, tracking=True)
    code = fields.Char(required=True, copy=False, tracking=True)
    phone = fields.Char()
    credit_limit = fields.Monetary(currency_field="currency_id")
    currency_id = fields.Many2one("res.currency", default=lambda self: self.env.company.currency_id)
    active = fields.Boolean(default=True)
    company_id = fields.Many2one("res.company", default=lambda self: self.env.company, required=True)
    state = fields.Selection([("active", "Active"), ("inactive", "Inactive")], default="active", tracking=True)

    _sql_constraints = [
        ("code_company_unique", "unique(code, company_id)", "Customer code must be unique per company."),
    ]


class VlxdSupplier(models.Model):
    _name = "vlxd.supplier"
    _description = "VLXD Supplier"
    _inherit = ["mail.thread", "mail.activity.mixin"]

    name = fields.Char(required=True, tracking=True)
    code = fields.Char(required=True, copy=False, tracking=True)
    phone = fields.Char()
    active = fields.Boolean(default=True)
    company_id = fields.Many2one("res.company", default=lambda self: self.env.company, required=True)
    state = fields.Selection([("active", "Active"), ("inactive", "Inactive")], default="active", tracking=True)

    _sql_constraints = [
        ("code_company_unique", "unique(code, company_id)", "Supplier code must be unique per company."),
    ]


class VlxdProductUnit(models.Model):
    _name = "vlxd.product.unit"
    _description = "VLXD Product Unit"
    _inherit = ["mail.thread", "mail.activity.mixin"]

    name = fields.Char(required=True, tracking=True)
    product_code = fields.Char(required=True, copy=False, tracking=True)
    unit_name = fields.Char(required=True)
    active = fields.Boolean(default=True)
    company_id = fields.Many2one("res.company", default=lambda self: self.env.company, required=True)
    state = fields.Selection([("active", "Active"), ("inactive", "Inactive")], default="active", tracking=True)

    _sql_constraints = [
        ("product_code_company_unique", "unique(product_code, company_id)", "Product code must be unique per company."),
    ]


class VlxdEmployee(models.Model):
    _name = "vlxd.employee"
    _description = "VLXD Employee"
    _inherit = ["mail.thread", "mail.activity.mixin"]

    name = fields.Char(required=True, tracking=True)
    code = fields.Char(required=True, copy=False, tracking=True)
    role_type = fields.Selection(
        [
            ("driver", "Driver"),
            ("worker", "Worker"),
            ("warehouse", "Warehouse"),
            ("sales", "Sales"),
            ("accountant", "Accountant"),
            ("supervisor", "Supervisor"),
        ],
        required=True,
        default="worker",
        tracking=True,
    )
    active = fields.Boolean(default=True)
    company_id = fields.Many2one("res.company", default=lambda self: self.env.company, required=True)
    state = fields.Selection([("active", "Active"), ("inactive", "Inactive")], default="active", tracking=True)

    _sql_constraints = [
        ("code_company_unique", "unique(code, company_id)", "Employee code must be unique per company."),
    ]
