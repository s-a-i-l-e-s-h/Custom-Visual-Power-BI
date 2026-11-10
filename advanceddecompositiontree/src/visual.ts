
"use strict";

import powerbi from "powerbi-visuals-api";
import { FormattingSettingsService } from "powerbi-visuals-utils-formattingmodel";
// @ts-ignore - the bundler processes LESS imports without a TypeScript declaration.
import "./../style/visual.less";

import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import IVisual = powerbi.extensibility.visual.IVisual;
import IVisualEventService = powerbi.extensibility.IVisualEventService;

import { VisualFormattingSettingsModel } from "./settings";

interface FinancialRow {
    segment: string;
    country: string;
    product: string;
    year: string;
    profit: number;
}

interface TreeNode {
    label: string;
    value: number;
    rows: FinancialRow[];
    depth: number;
    path: string;
}

interface PositionedNode extends TreeNode {
    x: number;
    y: number;
    children: PositionedNode[];
}

export class Visual implements IVisual {
    private events: IVisualEventService;
    private target: HTMLElement;
    private formattingSettings: VisualFormattingSettingsModel;
    private formattingSettingsService: FormattingSettingsService;

    private currentRows: FinancialRow[] = [];
    private expandedNodes: Set<string> = new Set([
        "profit-root",
        "loss-root"
    ]);

    private readonly dimensions = [
        "segment",
        "country",
        "product",
        "year"
    ];

    private readonly nodeWidth = 170;
    private readonly nodeHeight = 58;
    private readonly columnGap = 95;
    private readonly rowGap = 34;

    private readonly svgNamespace = "http://www.w3.org/2000/svg";

    private rootElement: HTMLElement;

    constructor(options: VisualConstructorOptions) {
        this.events = options.host.eventService;
        this.target = options.element;
        this.formattingSettingsService = new FormattingSettingsService();
        this.formattingSettings = new VisualFormattingSettingsModel();

        this.target.classList.add("decomposition-visual");

        this.target.style.width = "100%";
        this.target.style.height = "100%";
        this.target.style.minHeight = "0";
        this.target.style.overflowY = "auto";
        this.target.style.overflowX = "hidden";

        this.rootElement = document.createElement("div");
        this.rootElement.className = "decomposition-content";

        this.target.replaceChildren(this.rootElement);
    }

    private createSvgElement<K extends keyof SVGElementTagNameMap>(
        tag: K,
        attributes: Record<string, string> = {}
    ): SVGElementTagNameMap[K] {
        const element = document.createElementNS(
            this.svgNamespace,
            tag
        );

        Object.entries(attributes).forEach(([key, value]) => {
            element.setAttribute(key, value);
        });

        return element;
    }

    private formatValue(value: number): string {
        return value.toLocaleString("en-IN", {
            maximumFractionDigits: 2
        });
    }

    private getTotal(rows: FinancialRow[]): number {
        return rows.reduce(
            (total, row) => total + Math.abs(row.profit),
            0
        );
    }

    private getGroups(
        rows: FinancialRow[],
        dimension: string,
        depth: number,
        parentPath: string
    ): TreeNode[] {
        const groups = new Map<string, FinancialRow[]>();

        rows.forEach(row => {
            const label = String(
                row[dimension as keyof FinancialRow]
            );

            if (!groups.has(label)) {
                groups.set(label, []);
            }

            groups.get(label)!.push(row);
        });

        return Array.from(groups.entries())
            .map(([label, groupRows]) => ({
                label,
                value: this.getTotal(groupRows),
                rows: groupRows,
                depth,
                path: `${parentPath}/${label}`
            }))
            .sort((a, b) => b.value - a.value);
    }

    private buildPositionedNode(
        node: TreeNode,
        cursor: { y: number }
    ): PositionedNode {
        const isExpanded = this.expandedNodes.has(node.path);
        const hasNextLevel = node.depth < this.dimensions.length;

        let children: PositionedNode[] = [];

        if (isExpanded && hasNextLevel) {
            const nextDimension = this.dimensions[node.depth];

            const childNodes = this.getGroups(
                node.rows,
                nextDimension,
                node.depth + 1,
                node.path
            );

            children = childNodes.map(child =>
                this.buildPositionedNode(child, cursor)
            );
        }

        let y: number;

        if (children.length > 0) {
            const first = children[0];
            const last = children[children.length - 1];

            y = (first.y + last.y) / 2;
        } else {
            y = cursor.y;
            cursor.y += this.nodeHeight + this.rowGap;
        }

        return {
            ...node,
            x: 25 + node.depth * (this.nodeWidth + this.columnGap),
            y,
            children
        };
    }

    private getMaxDepth(node: PositionedNode): number {
        if (node.children.length === 0) {
            return node.depth;
        }

        return Math.max(
            ...node.children.map(child => this.getMaxDepth(child))
        );
    }

    private drawConnectors(
        svg: SVGSVGElement,
        node: PositionedNode,
        color: string
    ): void {
        node.children.forEach(child => {
            const startX = node.x + this.nodeWidth;
            const startY = node.y + this.nodeHeight / 2;
            const endX = child.x;
            const endY = child.y + this.nodeHeight / 2;
            const middleX = (startX + endX) / 2;

            const path = this.createSvgElement("path", {
                d: `M ${startX} ${startY} C ${middleX} ${startY}, ${middleX} ${endY}, ${endX} ${endY}`,
                fill: "none",
                stroke: color,
                "stroke-width": "2",
                "stroke-linecap": "round"
            });

            svg.appendChild(path);

            this.drawConnectors(svg, child, color);
        });
    }

    private drawNode(
        svg: SVGSVGElement,
        node: PositionedNode,
        branchClass: string,
        color: string,
        background: string
    ): void {
        const group = this.createSvgElement("g", {
            class: `decomposition-node ${branchClass}`,
            transform: `translate(${node.x}, ${node.y})`
        });

        const hasNextLevel = node.depth < this.dimensions.length;
        const isExpanded = this.expandedNodes.has(node.path);

        const rect = this.createSvgElement("rect", {
            x: "0",
            y: "0",
            width: String(this.nodeWidth),
            height: String(this.nodeHeight),
            rx: "9",
            fill: background,
            stroke: color,
            "stroke-width": "1.8"
        });

        group.appendChild(rect);

        const label = this.createSvgElement("text", {
            x: "12",
            y: "23",
            class: "node-label"
        });

        label.textContent = node.label;
        group.appendChild(label);

        const value = this.createSvgElement("text", {
            x: "12",
            y: "43",
            class: "node-value"
        });

        value.textContent = this.formatValue(node.value);
        group.appendChild(value);

        if (hasNextLevel) {
            const toggle = this.createSvgElement("text", {
                x: String(this.nodeWidth - 17),
                y: "35",
                class: "node-toggle"
            });

            toggle.textContent = isExpanded ? "−" : "+";
            group.appendChild(toggle);

            group.style.cursor = "pointer";

            group.addEventListener("click", () => {
                if (isExpanded) {
                    this.expandedNodes.delete(node.path);
                } else {
                    this.expandedNodes.add(node.path);
                }

                this.renderTree();
            });
        }

        svg.appendChild(group);

        node.children.forEach(child => {
            this.drawNode(
                svg,
                child,
                branchClass,
                color,
                background
            );
        });
    }

    private createBranch(
        title: string,
        rows: FinancialRow[],
        branchClass: string,
        rootPath: string,
        color: string,
        background: string
    ): HTMLElement {
        const branch = document.createElement("section");
        branch.className = `tree-branch ${branchClass}`;

        const heading = document.createElement("div");
        heading.className = "branch-heading";

        const summary = document.createElement("div");
        summary.className = "branch-summary";

        const titleElement = document.createElement("h2");
        titleElement.textContent = title;

        const totalElement = document.createElement("span");
        totalElement.textContent = this.formatValue(
            this.getTotal(rows)
        );

        summary.appendChild(titleElement);
        summary.appendChild(totalElement);
        heading.appendChild(summary);

        const expandButton = document.createElement("button");
        expandButton.className = "branch-expand-button";
        expandButton.setAttribute("type", "button");

        const isExpanded = this.expandedNodes.has(rootPath);

        expandButton.textContent = isExpanded
            ? "Collapse −"
            : "Expand +";

        expandButton.addEventListener("click", () => {
            if (isExpanded) {
                this.expandedNodes.delete(rootPath);
            } else {
                this.expandedNodes.add(rootPath);
            }

            this.renderTree();
        });

        heading.appendChild(expandButton);
        branch.appendChild(heading);

        if (rows.length === 0) {
            const empty = document.createElement("div");
            empty.className = "tree-empty";
            empty.textContent = "No records available";
            branch.appendChild(empty);
            return branch;
        }

        const root: TreeNode = {
            label: title,
            value: this.getTotal(rows),
            rows,
            depth: 0,
            path: rootPath
        };

        const cursor = { y: 35 };

        const positionedRoot = this.buildPositionedNode(
            root,
            cursor
        );

        const maxDepth = this.getMaxDepth(positionedRoot);

        const svgWidth =
            25 +
            maxDepth * (this.nodeWidth + this.columnGap) +
            this.nodeWidth +
            30;

        const svgHeight = Math.max(
            130,
            cursor.y + 25
        );

        const svg = this.createSvgElement("svg", {
            width: String(svgWidth),
            height: String(svgHeight),
            viewBox: `0 0 ${svgWidth} ${svgHeight}`,
            role: "img",
            "aria-label": `${title} decomposition tree`
        });

        this.drawConnectors(
            svg,
            positionedRoot,
            color
        );

        this.drawNode(
            svg,
            positionedRoot,
            branchClass,
            color,
            background
        );

        const scrollArea = document.createElement("div");
        scrollArea.className = "tree-scroll-area";
        scrollArea.appendChild(svg);

        branch.appendChild(scrollArea);

        return branch;
    }

    private renderTree(): void {
        this.rootElement.replaceChildren();

        const heading = document.createElement("div");
        heading.className = "tree-main-heading";

        const title = document.createElement("h1");
        title.textContent = "Financial Performance";

        const subtitle = document.createElement("p");
        subtitle.textContent = "Profit and Loss Decomposition";

        heading.appendChild(title);
        heading.appendChild(subtitle);

        const branches = document.createElement("div");
        branches.className = "tree-branches";

        const profitRows = this.currentRows.filter(
            row => row.profit > 0
        );

        const lossRows = this.currentRows.filter(
            row => row.profit < 0
        );

        branches.appendChild(
            this.createBranch(
                "PROFIT",
                profitRows,
                "profit-branch",
                "profit-root",
                "#16A34A",
                "#F0FDF4"
            )
        );

        branches.appendChild(
            this.createBranch(
                "LOSS",
                lossRows,
                "loss-branch",
                "loss-root",
                "#DC2626",
                "#FEF2F2"
            )
        );

        this.rootElement.appendChild(heading);
        this.rootElement.appendChild(branches);
    }

    public update(options: VisualUpdateOptions): void {
        this.events.renderingStarted(options);

        try {
            const dataView = options.dataViews?.[0];

            if (dataView) {
                this.formattingSettings =
                    this.formattingSettingsService.populateFormattingSettingsModel(
                        VisualFormattingSettingsModel,
                        dataView
                    );
            }

            const categorical = dataView?.categorical;
            const categories = categorical?.categories ?? [];
            const values = categorical?.values ?? [];

            const profitColumn = values.find(
                column => column.source.roles?.profit
            );

            const segmentColumn = categories.find(
                column => column.source.roles?.segment
            );

            const countryColumn = categories.find(
                column => column.source.roles?.country
            );

            const productColumn = categories.find(
                column => column.source.roles?.product
            );

            const yearColumn = categories.find(
                column => column.source.roles?.year
            );

            if (
                !profitColumn ||
                !segmentColumn ||
                !countryColumn ||
                !productColumn ||
                !yearColumn
            ) {
                this.rootElement.replaceChildren();

                const message = document.createElement("div");
                message.className = "tree-empty";
                message.textContent =
                    "Add Profit, Segment, Country, Product and Year fields.";

                this.rootElement.appendChild(message);

                this.events.renderingFinished(options);
                return;
            }

            const rows: FinancialRow[] = [];
            const rowCount = profitColumn.values.length;

            for (let index = 0; index < rowCount; index++) {
                const rawProfit = profitColumn.values[index];

                if (
                    rawProfit === null ||
                    rawProfit === undefined
                ) {
                    continue;
                }

                const profit = Number(rawProfit);

                if (!Number.isFinite(profit)) {
                    continue;
                }

                rows.push({
                    profit,
                    segment: String(
                        segmentColumn.values[index] ?? "(Blank)"
                    ),
                    country: String(
                        countryColumn.values[index] ?? "(Blank)"
                    ),
                    product: String(
                        productColumn.values[index] ?? "(Blank)"
                    ),
                    year: String(
                        yearColumn.values[index] ?? "(Blank)"
                    )
                });
            }

            this.currentRows = rows;
            this.renderTree();

            this.events.renderingFinished(options);

        } catch (error) {
            console.error("Decomposition Tree Error:", error);
            this.events.renderingFailed(options, String(error));
        }
    }

    public getFormattingModel(): powerbi.visuals.FormattingModel {
        return this.formattingSettingsService.buildFormattingModel(
            this.formattingSettings
        );
    }
}
