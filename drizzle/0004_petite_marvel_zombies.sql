CREATE TABLE `ride_locations` (
	`rideId` int NOT NULL,
	`driverId` int NOT NULL,
	`userId` int NOT NULL,
	`lat` double NOT NULL,
	`lng` double NOT NULL,
	`accuracy` double,
	`capturedAt` timestamp NOT NULL,
	`receivedAt` timestamp NOT NULL DEFAULT (now()),
	`sharing` boolean NOT NULL DEFAULT true,
	CONSTRAINT `ride_locations_rideId` PRIMARY KEY(`rideId`)
);
--> statement-breakpoint
ALTER TABLE `rides` ADD `pickupLat` double;--> statement-breakpoint
ALTER TABLE `rides` ADD `pickupLng` double;--> statement-breakpoint
ALTER TABLE `rides` ADD `dropoffLat` double;--> statement-breakpoint
ALTER TABLE `rides` ADD `dropoffLng` double;--> statement-breakpoint
ALTER TABLE `rides` ADD `routePolyline` text;--> statement-breakpoint
ALTER TABLE `rides` ADD `routeDurationSeconds` int;--> statement-breakpoint
ALTER TABLE `rides` ADD `routeSource` enum('manual','google_maps') DEFAULT 'manual' NOT NULL;--> statement-breakpoint
CREATE INDEX `ride_locations_driver_idx` ON `ride_locations` (`driverId`);--> statement-breakpoint
CREATE INDEX `ride_locations_received_idx` ON `ride_locations` (`receivedAt`);