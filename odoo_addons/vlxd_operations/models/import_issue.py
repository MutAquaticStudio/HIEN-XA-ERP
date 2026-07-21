from odoo import fields, models


class VlxdImportIssue(models.Model):
    _name = "vlxd.import.issue"
    _description = "VLXD Import Issue"
    _inherit = ["mail.thread", "mail.activity.mixin"]

    name = fields.Char(required=True)
    source_sheet = fields.Char(required=True)
    row_number = fields.Integer(required=True)
    severity = fields.Selection([("warning", "Warning"), ("error", "Error")], required=True, default="warning")
    message = fields.Text(required=True)
    company_id = fields.Many2one("res.company", default=lambda self: self.env.company, required=True)
    state = fields.Selection([("open", "Open"), ("resolved", "Resolved")], default="open", tracking=True)
