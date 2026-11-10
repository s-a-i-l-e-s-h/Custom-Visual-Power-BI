
"use strict";

import powerbi from "powerbi-visuals-api";
import { FormattingSettingsService } from "powerbi-visuals-utils-formattingmodel";
import "./../style/visual.less";

import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import IVisual = powerbi.extensibility.visual.IVisual;
import IVisualEventService = powerbi.extensibility.IVisualEventService;

import { VisualFormattingSettingsModel } from "./settings";

export class Visual implements IVisual {
    private events: IVisualEventService;
    private target: HTMLElement;
    private formattingSettings: VisualFormattingSettingsModel;
    private formattingSettingsService: FormattingSettingsService;

    constructor(options: VisualConstructorOptions) {
        this.events = options.host.eventService;
        this.target = options.element;
        this.formattingSettingsService = new FormattingSettingsService();
        this.formattingSettings = new VisualFormattingSettingsModel();
    }

    private createElement(
        tag: string,
        className?: string,
        text?: string
    ): HTMLElement {
        const element = document.createElement(tag);

        if (className) {
            element.className = className;
        }

        if (text !== undefined) {
            element.textContent = text;
        }

        return element;
    }

    private renderEmptyMessage(): void {
        this.target.replaceChildren();

        const message = this.createElement(
            "div",
            "kpi-empty",
            "Add valid Actual and Target measures."
        );

        this.target.appendChild(message);
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

            const values = dataView?.categorical?.values;

            const actualColumn = values?.find(
                column => column.source.roles?.actual
            );

            const targetColumn = values?.find(
                column => column.source.roles?.target
            );

            const growthColumn = values?.find(
                column => column.source.roles?.growth
            );

            const actualRaw = actualColumn?.values[0];
            const targetRaw = targetColumn?.values[0];
            const growthRaw = growthColumn?.values[0];

            const actual = Number(actualRaw);
            const target = Number(targetRaw);
            const growth = Number(growthRaw);

            if (
                actualRaw === null ||
                actualRaw === undefined ||
                targetRaw === null ||
                targetRaw === undefined ||
                !Number.isFinite(actual) ||
                !Number.isFinite(target) ||
                target <= 0
            ) {
                this.renderEmptyMessage();
                this.events.renderingFinished(options);
                return;
            }

            const achievement = (actual / target) * 100;

            let status = "Off Track";
            let statusClass = "off-track";

            if (achievement >= 100) {
                status = "On Track";
                statusClass = "on-track";
            } else if (achievement >= 80) {
                status = "At Risk";
                statusClass = "at-risk";
            }

            const progress = Math.max(
                0,
                Math.min(achievement, 100)
            );

            const formatValue = (value: number): string =>
                value.toLocaleString("en-IN", {
                    maximumFractionDigits: 2
                });

            const growthText = Number.isFinite(growth)
                ? `${growth.toFixed(1)}%`
                : "N/A";

            this.target.replaceChildren();

            const container = this.createElement(
                "div",
                "kpi-container"
            );

            const header = this.createElement(
                "div",
                "kpi-header"
            );

            header.appendChild(
                this.createElement(
                    "span",
                    "kpi-title",
                    "Revenue Performance"
                )
            );

            const statusElement = this.createElement(
                "span",
                `kpi-status ${statusClass}`,
                status
            );

            header.appendChild(statusElement);

            const main = this.createElement(
                "div",
                "kpi-main"
            );

            main.appendChild(
                this.createElement(
                    "div",
                    "kpi-value",
                    formatValue(actual)
                )
            );

            main.appendChild(
                this.createElement(
                    "div",
                    "kpi-subtitle",
                    "Actual Value"
                )
            );

            const details = this.createElement(
                "div",
                "kpi-details"
            );

            const targetDetail = this.createElement(
                "div",
                "kpi-detail"
            );

            targetDetail.appendChild(
                this.createElement("span", undefined, "Target")
            );

            targetDetail.appendChild(
                this.createElement(
                    "strong",
                    undefined,
                    formatValue(target)
                )
            );

            const achievementDetail = this.createElement(
                "div",
                "kpi-detail"
            );

            achievementDetail.appendChild(
                this.createElement(
                    "span",
                    undefined,
                    "Achievement"
                )
            );

            achievementDetail.appendChild(
                this.createElement(
                    "strong",
                    undefined,
                    `${achievement.toFixed(1)}%`
                )
            );

            const growthDetail = this.createElement(
                "div",
                "kpi-detail"
            );

            growthDetail.appendChild(
                this.createElement("span", undefined, "Growth")
            );

            growthDetail.appendChild(
                this.createElement(
                    "strong",
                    "growth-value",
                    growthText
                )
            );

            details.appendChild(targetDetail);
            details.appendChild(achievementDetail);
            details.appendChild(growthDetail);

            const progressTrack = this.createElement(
                "div",
                "progress-track"
            );

            const progressFill = this.createElement(
                "div",
                `progress-fill ${statusClass}`
            );

            progressFill.style.width = `${progress}%`;
            progressTrack.appendChild(progressFill);

            const progressLabel = this.createElement(
                "div",
                "progress-label"
            );

            progressLabel.appendChild(
                this.createElement("span", undefined, "0%")
            );

            progressLabel.appendChild(
                this.createElement(
                    "span",
                    undefined,
                    "100% Target"
                )
            );

            container.appendChild(header);
            container.appendChild(main);
            container.appendChild(details);
            container.appendChild(progressTrack);
            container.appendChild(progressLabel);

            this.target.appendChild(container);

            this.events.renderingFinished(options);

        } catch (error) {
            console.error("KPI Visual Error:", error);
            this.events.renderingFailed(options, String(error));
        }
    }

    public getFormattingModel(): powerbi.visuals.FormattingModel {
        return this.formattingSettingsService.buildFormattingModel(
            this.formattingSettings
        );
    }
}
