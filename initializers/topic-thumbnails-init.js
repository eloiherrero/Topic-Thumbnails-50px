import { withPluginApi } from "discourse/lib/plugin-api";
import { inject as service } from "@ember/service";
import { readOnly } from "@ember/object/computed";
import discourseComputed, { observes } from "discourse-common/utils/decorators";
import { once } from "@ember/runloop";
import {
  getResolverOption,
  setResolverOption,
} from "discourse-common/resolver";

export default {
  name: "topic-thumbnails-init",
  initialize() {
    withPluginApi("0.8.7", (api) => this.initWithApi(api));
  },

  initWithApi(api) {
    api.modifyClass("component:topic-list", {
      topicThumbnailsService: service("topic-thumbnails"),
      classNameBindings: [
        "isThumbnailGrid:topic-thumbnails-grid",
        "isThumbnailList:topic-thumbnails-list",
        "isMasonryList:topic-thumbnails-masonry",
      ],
      isThumbnailGrid: readOnly("topicThumbnailsService.displayGrid"),
      isThumbnailList: readOnly("topicThumbnailsService.displayList"),
      isMasonryList: readOnly("topicThumbnailsService.displayMasonry"),
    });

    api.modifyClass("component:topic-list-item", {
      topicThumbnailsService: service("topic-thumbnails"),

      // Hack to disable the mobile topic-list-item template
      // Our grid styling is responsive, and uses the desktop HTML structure
      renderTopicListItem() {
        const wasMobileView = getResolverOption("mobileView");
        if (
          wasMobileView &&
          (this.topicThumbnailsService.displayGrid ||
            this.topicThumbnailsService.displayMasonry)
        ) {
          setResolverOption("mobileView", false);
        }

        this._super();

        if (wasMobileView) {
          setResolverOption("mobileView", true);
        }
      },
    });

    //////////////////////////
    /////////// Masonry Layout
    //////////////////////////
    api.modifyClass("component:topic-list", {
      topicThumbnailsService: service("topic-thumbnails"),

      masonryTargetColumnWidth: 300,
      masonryGridSpacingPixels: 50,
      masonryTitleSpacePixels: 76,
      masonryDefaultAspect: 1.3,
      masonryMinAspect: 0.7,

      @discourseComputed("masonryContainerWidth")
      masonryNumColumns(width) {
        return Math.floor(width / this.masonryTargetColumnWidth);
      },

      @discourseComputed(
        "masonryNumColumns",
        "masonryContainerWidth",
        "masonryGridSpacingPixels"
      )
      masonryColumnWidth(numColumns, containerWidth, gridSpacing) {
        return (containerWidth - (numColumns - 1) * gridSpacing) / numColumns;
      },

      didInsertElement() {
        this._super();
        if (!this.topicThumbnailsService.displayMasonry) return;
        this.updateElementHeight();

        if (window.ResizeObserver) {
          const observer = new ResizeObserver(() => this.updateElementHeight());
          observer.observe(this.element);
          this.set("resizeObserver", observer);
        }
      },

      willDestroyElement() {
        this._super();
        if (this.resizeObserver) {
          this.resizeObserver.unobserve(this.element);
        }
      },

      updateElementHeight() {
        this.set(
          "masonryContainerWidth",
          this.element.getBoundingClientRect().width
        );
      },

      @observes("topics.[]", "masonryContainerWidth")
      masonryTopicsChanged() {
        if (!this.topicThumbnailsService.displayMasonry) return;
        if (!this.masonryContainerWidth) return;
        once(this, this.calculateMasonryLayout);
      },

      calculateMasonryLayout() {
        const numColumns = this.masonryNumColumns;
        const gridSpacingPixels = this.masonryGridSpacingPixels;

        const columnHeights = [];
        for (let n = 0; n < numColumns; n++) {
          columnHeights[n] = 0;
        }

        this.filteredTopics.forEach((topic) => {
          // Pick the column with the lowest height
          const smallestColumn = columnHeights.indexOf(
            Math.min(...columnHeights)
          );

          // Get the height of this topic
          let aspect = this.masonryDefaultAspect;
          if (topic.thumbnails) {
            aspect = topic.thumbnails[0].width / topic.thumbnails[0].height;
          }
          aspect = Math.max(aspect, this.masonryMinAspect);
          const thisHeight =
            this.masonryColumnWidth / aspect + this.masonryTitleSpacePixels;

          topic.set("masonryData", {
            columnIndex: smallestColumn,
            height: thisHeight,
            heightAbove: columnHeights[smallestColumn],
          });

          columnHeights[smallestColumn] += thisHeight + gridSpacingPixels;
        });

        this.set("masonryTallestColumn", Math.max(...columnHeights));
      },

      attributeBindings: ["masonryStyle:style"],

      @discourseComputed(
        "topicThumbnailsService.displayMasonry",
        "masonryNumColumns",
        "masonryGridSpacingPixels",
        "masonryTallestColumn",
        "masonryColumnWidth"
      )
      masonryStyle(
        useMasonry,
        numColumns,
        gridSpacingPixels,
        tallestColumn,
        columnWidth
      ) {
        if (!useMasonry) return;

        return (
          `--masonry-num-columns: ${Math.round(numColumns)}; ` +
          `--masonry-grid-spacing: ${gridSpacingPixels}px; ` +
          `--masonry-tallest-column: ${Math.round(tallestColumn)}px; ` +
          `--masonry-column-width: ${Math.round(columnWidth)}px; `
        ).htmlSafe();
      },
    });

    api.modifyClass("component:topic-list-item", {
      attributeBindings: ["masonryStyle:style"],

      @discourseComputed("topic.masonryData")
      masonryStyle(masonryData) {
        if (!masonryData) return;

        return (
          `--masonry-height: ${Math.round(masonryData.height)}px; ` +
          `--masonry-height-above: ${Math.round(masonryData.heightAbove)}px; ` +
          `--masonry-column-index: ${masonryData.columnIndex};`
        ).htmlSafe();
      },
    });
  },
};
