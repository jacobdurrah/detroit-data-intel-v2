#!/usr/bin/env python3
"""Build a polished PDF overview of the Property Search tool for Kwaku."""

from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    HRFlowable
)
from reportlab.lib.enums import TA_LEFT, TA_CENTER
from datetime import datetime
import os

OUTPUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "property-search-overview.pdf")

doc = SimpleDocTemplate(
    OUTPUT, pagesize=letter,
    topMargin=0.6*inch, bottomMargin=0.6*inch,
    leftMargin=0.75*inch, rightMargin=0.75*inch
)

styles = getSampleStyleSheet()
styles.add(ParagraphStyle('Title2', parent=styles['Normal'],
    fontSize=22, textColor=colors.HexColor('#0f3460'),
    spaceAfter=4, fontName='Helvetica-Bold', alignment=TA_CENTER))
styles.add(ParagraphStyle('Subtitle2', parent=styles['Normal'],
    fontSize=12, textColor=colors.HexColor('#555555'),
    spaceAfter=16, fontName='Helvetica', alignment=TA_CENTER))
styles.add(ParagraphStyle('SectionHead', parent=styles['Normal'],
    fontSize=14, textColor=colors.HexColor('#0f3460'),
    spaceBefore=16, spaceAfter=8, fontName='Helvetica-Bold'))
styles.add(ParagraphStyle('SubHead', parent=styles['Normal'],
    fontSize=11, textColor=colors.HexColor('#1a1a2e'),
    spaceBefore=8, spaceAfter=4, fontName='Helvetica-Bold'))
styles.add(ParagraphStyle('Body', parent=styles['Normal'],
    fontSize=10, leading=14, spaceAfter=6))
styles.add(ParagraphStyle('Bullet2', parent=styles['Normal'],
    fontSize=10, leading=14, leftIndent=20, spaceAfter=4,
    bulletIndent=10))
styles.add(ParagraphStyle('SmallGray', parent=styles['Normal'],
    fontSize=8, textColor=colors.HexColor('#888888'), alignment=TA_CENTER))


def make_table(headers, rows, col_widths=None):
    data = [headers] + rows
    style = TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#0f3460')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 9),
        ('FONTSIZE', (0, 1), (-1, -1), 9),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#cccccc')),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f0f4ff')]),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
    ])
    t = Table(data, colWidths=col_widths, repeatRows=1)
    t.setStyle(style)
    return t


def step_table(step_num, title, description):
    data = [[
        Paragraph(f'<font color="white"><b>{step_num}</b></font>', styles['Body']),
        Paragraph(f'<b>{title}</b><br/>{description}', styles['Body'])
    ]]
    t = Table(data, colWidths=[0.4*inch, 6.1*inch])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (0, 0), colors.HexColor('#0f3460')),
        ('ALIGN', (0, 0), (0, 0), 'CENTER'),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
    ]))
    return t


story = []

# Title
story.append(Paragraph("Property Search Tool", styles['Title2']))
story.append(Paragraph("Framework Real Estate Solutions — User Guide", styles['Subtitle2']))
story.append(Paragraph(
    f"Generated: {datetime.now().strftime('%B %d, %Y')} | detroit-data-intel-v2.vercel.app",
    styles['SmallGray']))
story.append(HRFlowable(width="100%", thickness=2, color=colors.HexColor('#0f3460')))
story.append(Spacer(1, 16))

# Overview
story.append(Paragraph("Overview", styles['SectionHead']))
story.append(Paragraph(
    'An AI-powered property search tool that scans 1,000+ Detroit MLS listings every morning, '
    'filters them through our "Dusty Turnkey" buying criteria, and delivers a graded intelligence '
    "report of the top 20 picks — with deal math, neighborhood analysis, and mechanical system checks. "
    "The system learns from your feedback: every thumbs-up or thumbs-down trains tomorrow's report to find better matches.",
    styles['Body']))
story.append(Spacer(1, 8))

# Access
story.append(Paragraph("Access", styles['SectionHead']))
story.append(make_table(
    ['Detail', 'Value'],
    [
        ['URL', 'https://detroit-data-intel-v2.vercel.app'],
        ['Works On', 'Phone (Safari/Chrome) + Desktop browser'],
        ['Daily Report', 'Auto-generated at 7:30 AM ET every morning'],
        ['Tab', 'Click "Search" in the bottom navigation bar'],
    ],
    col_widths=[2*inch, 4.5*inch]
))
story.append(Spacer(1, 12))

# The Pipeline
story.append(Paragraph("The Daily Pipeline", styles['SectionHead']))
story.append(Paragraph(
    'Every morning at 7:30 AM, the system runs this automated funnel:',
    styles['Body']))
story.append(Spacer(1, 6))

story.append(step_table("1", "Wide Net — ~1,000 listings",
    "Pulls all active Detroit single-family, duplex, triplex, and quad listings from Redfin MLS."))
story.append(Spacer(1, 4))
story.append(step_table("2", "Target Areas — ~589 listings",
    "Filters to Tier 1 neighborhoods (East English Village, Grandmont-Rosedale, Boston-Edison, etc.) "
    "and Tier 2 watch areas (Brightmoor select blocks, Core City, Fitzgerald, etc.)."))
story.append(Spacer(1, 4))
story.append(step_table("3", "Price Range — ~250 listings",
    "Filters to our $50K-$120K purchase range."))
story.append(Spacer(1, 4))
story.append(step_table("4", "Grading — Top 20 picks",
    "Scores each property on price-to-value ratio, neighborhood strength, mechanical updates, "
    "listing keywords, and learned feedback. Grades: A (90+), B (75-89), C (60-74)."))
story.append(Spacer(1, 4))
story.append(step_table("5", "Enrichment",
    "Top 20 get listing descriptions scraped for mechanical keywords (furnace, roof, electrical, "
    "plumbing, water heater). Top 10 get permit records checked from city database."))
story.append(Spacer(1, 12))

# What You See
story.append(Paragraph("What You See — Search Tab", styles['SectionHead']))

story.append(Paragraph("Report Header", styles['SubHead']))
story.append(Paragraph(
    "• <b>Strategy Table (left)</b> — Our buying criteria: purchase range, property types, cash-in target, refi timeline, required updates",
    styles['Bullet2']))
story.append(Paragraph(
    "• <b>Market Medians (center)</b> — Current median prices for Tier 1 and Tier 2 neighborhoods",
    styles['Bullet2']))
story.append(Paragraph(
    "• <b>Funnel (right)</b> — How many properties survived each filter stage",
    styles['Bullet2']))
story.append(Paragraph(
    "• <b>Feedback Summary</b> — What the system learned from previous votes",
    styles['Bullet2']))
story.append(Spacer(1, 6))

story.append(Paragraph("Property Cards (scroll down)", styles['SubHead']))
story.append(Paragraph("Each of the 20 graded properties shows:", styles['Body']))
story.append(make_table(
    ['Section', 'What It Shows'],
    [
        ['Grade Badge', 'A (green), B (blue), or C (yellow) + score out of 100'],
        ['Address & Price', 'Street address, list price, $/sqft, neighborhood tier, days on market'],
        ['Mechanicals Checklist', 'Check or X for: Furnace, Roof, Electrical, Plumbing, Water Heater\n(detected from listing description keywords)'],
        ['Deal Math', 'Purchase price, 20% down payment, estimated ARV, equity at ARV,\nrefi cashout potential, estimated monthly rent'],
        ['Positives & Concerns', 'AI-identified pros (updated systems, good location) and cons\n(no mechanical info, high $/sqft, etc.)'],
        ['Score Breakdown', 'Expandable — shows exactly how each factor contributed to the score'],
    ],
    col_widths=[1.5*inch, 5*inch]
))
story.append(Spacer(1, 12))

# How to Interact
story.append(Paragraph("How to Interact — Vote on Every Property", styles['SectionHead']))
story.append(Paragraph(
    'Your votes are the most important input. They train the AI to find better properties each day.',
    styles['Body']))
story.append(Spacer(1, 6))

story.append(make_table(
    ['Button', 'What It Does', 'Why It Matters'],
    [
        ['Interested', 'Saves the property for deeper\nresearch. Agent-X generates\na full DD report.', 'Tells the system\n"find more like this"'],
        ['Pass', 'Opens a popup asking WHY\nyou are passing. Options:\ntoo much work, bad area,\nprice too high, etc.', 'Most important feedback\n— teaches what to\navoid tomorrow'],
        ['Save', 'Bookmarks to the Saved tab\nfor later. Does not count\nas a vote.', 'Use when you want to\nresearch more before\ndeciding'],
        ['Listing', 'Opens the Redfin listing page\ndirectly.', 'See full photos, description,\nand agent contact info'],
    ],
    col_widths=[1*inch, 2.5*inch, 3*inch]
))
story.append(Spacer(1, 12))

# Saved Tab
story.append(Paragraph("Saved Tab — Property Pipeline", styles['SectionHead']))
story.append(Paragraph(
    'All bookmarked properties appear here. Track each property through the acquisition pipeline:',
    styles['Body']))
story.append(make_table(
    ['Status', 'Meaning'],
    [
        ['Researching', 'DD report being generated — pulling comps, permits, ownership history'],
        ['Offer Pending', 'We have submitted an offer on this property'],
        ['Under Contract', 'Offer accepted, in due diligence / closing'],
        ['Closed', 'Property acquired — moves to portfolio management'],
        ['Passed', 'Decided against after deeper research'],
    ],
    col_widths=[1.5*inch, 5*inch]
))
story.append(Spacer(1, 12))

# Learning Loop
story.append(Paragraph("The Learning Loop", styles['SectionHead']))
story.append(Paragraph(
    'The system gets smarter every day based on your votes:',
    styles['Body']))
story.append(Paragraph(
    '• Pass on a property because <b>"too much work"</b>? Tomorrow it penalizes listings without mechanical updates',
    styles['Bullet2']))
story.append(Paragraph(
    '• Like properties in <b>East English Village</b>? It weights that neighborhood higher in scoring',
    styles['Bullet2']))
story.append(Paragraph(
    '• Pass because <b>"price too high"</b>? It adjusts the price-to-value ratio scoring',
    styles['Bullet2']))
story.append(Paragraph(
    '• Both Jacob and Kwaku can vote independently — the system tracks who voted what',
    styles['Bullet2']))
story.append(Spacer(1, 8))
story.append(Paragraph(
    '<b>Bottom line:</b> The more you vote, the better the daily report gets. Even a quick Pass with a reason '
    "is valuable — it takes 5 seconds and makes tomorrow's picks sharper.",
    styles['Body']))
story.append(Spacer(1, 12))

# Daily Workflow
story.append(Paragraph("Recommended Daily Workflow", styles['SectionHead']))
story.append(step_table("1", "Check the report (~8 AM)",
    "Open the app, go to Search tab. Today's 20 graded picks are ready."))
story.append(Spacer(1, 4))
story.append(step_table("2", "Vote on each property (5-10 min)",
    "Scroll through. Thumbs-up ones with potential, thumbs-down ones that don't fit (always say why)."))
story.append(Spacer(1, 4))
story.append(step_table("3", "Review saved properties",
    "Check Saved tab for DD report updates on properties you liked."))
story.append(Spacer(1, 4))
story.append(step_table("4", "Discuss in Discord",
    "Flag interesting finds in #dusty-turnkey-detroit for team discussion."))
story.append(Spacer(1, 16))

# Strategy
story.append(Paragraph("Current Strategy: Dusty Turnkey", styles['SectionHead']))
story.append(make_table(
    ['Parameter', 'Value'],
    [
        ['Purchase Range', '$50,000 - $120,000'],
        ['Property Types', 'SFH, Duplex, Triplex, Quad'],
        ['Target Layout', '3bd 1-2ba, plumbing on first floor, single story preferred'],
        ['ARV Target', 'Ugly house on thriving block — appreciation upside'],
        ['Total Cash In', '~$50K (20K down + 10K polish + 20K contingency)'],
        ['Refi Timeline', '6 months, minimum $30K cashout'],
        ['Required', 'Mechanicals updated within 5 years'],
        ['Preferred', 'Roof updated within 5 years'],
        ['Avoid', 'Full rehab, foundation issues, fire damage, environmental, demos list'],
    ],
    col_widths=[2*inch, 4.5*inch]
))
story.append(Spacer(1, 8))

story.append(Paragraph("Target Neighborhoods", styles['SubHead']))
story.append(make_table(
    ['Tier', 'Neighborhoods'],
    [
        ['Tier 1\n(Priority)', 'East English Village, Grandmont-Rosedale, Rosedale Park, Bagley,\n'
         'University District, Sherwood Forest, Martin Park, Morningside,\n'
         'Indian Village, Boston-Edison, East Village, West Village, Islandview'],
        ['Tier 2\n(Watch)', "Brightmoor (select blocks), Fitzgerald, Core City, North End,\n"
         "Crary-St. Mary's, Cerveny, Conner, Corktown (fringe), Woodbridge"],
    ],
    col_widths=[1.2*inch, 5.3*inch]
))

# Footer
story.append(Spacer(1, 24))
story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor('#cccccc')))
story.append(Paragraph(
    "Framework Real Estate Solutions LLC | Confidential | For internal use only",
    styles['SmallGray']
))

doc.build(story)
print(f"PDF generated: {OUTPUT}")
