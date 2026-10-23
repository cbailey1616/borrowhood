#import <React/RCTViewManager.h>
#import <React/RCTComponent.h>
#import <UIKit/UIKit.h>

@interface BorrowhoodReservedRegionsView : UIView
@property (nonatomic, copy) RCTDirectEventBlock onRegionsChange;
@end

@implementation BorrowhoodReservedRegionsView {
  NSDictionary *_lastPayload;
}
@synthesize onRegionsChange = _onRegionsChange;

- (instancetype)initWithFrame:(CGRect)frame {
  if ((self = [super initWithFrame:frame])) {
    self.userInteractionEnabled = NO;
    self.backgroundColor = UIColor.clearColor;
  }
  return self;
}

- (void)setOnRegionsChange:(RCTDirectEventBlock)callback {
  _onRegionsChange = [callback copy];
  _lastPayload = nil;
  [self publishRegions];
}

- (void)didMoveToWindow { [super didMoveToWindow]; [self publishRegions]; }
- (void)layoutSubviews { [super layoutSubviews]; [self publishRegions]; }
- (void)safeAreaInsetsDidChange { [super safeAreaInsetsDidChange]; [self publishRegions]; }

- (void)publishRegions {
  if (!self.window || !_onRegionsChange) return;
  NSMutableArray *regions = [NSMutableArray array];
  // Older SDKs use the ordinary safe area; Duo builds read the reserved regions.
#if __IPHONE_OS_VERSION_MAX_ALLOWED >= 270100
  if (@available(iOS 27.1, *)) {
    for (UIViewReservedRegion *region in [self reservedRegionsOfKind:UIViewReservedRegionKind.occlusionRegionKind]) {
      if (!region.active || CGRectIsEmpty(region.frame)) continue;
      CGRect frame = region.frame; // Includes the system's interactive margins.
      [regions addObject:@{@"x": @(CGRectGetMinX(frame)), @"y": @(CGRectGetMinY(frame)),
        @"width": @(CGRectGetWidth(frame)), @"height": @(CGRectGetHeight(frame))}];
    }
  }
  #endif
  NSDictionary *payload = @{@"regions": regions, @"width": @(self.bounds.size.width), @"height": @(self.bounds.size.height)};
  if (![_lastPayload isEqualToDictionary:payload]) {
    _lastPayload = payload;
    _onRegionsChange(payload);
  }
}
@end

@interface BorrowhoodReservedRegionsManager : RCTViewManager
@end
@implementation BorrowhoodReservedRegionsManager
RCT_EXPORT_MODULE(BorrowhoodReservedRegions)
+ (BOOL)requiresMainQueueSetup { return YES; }
- (UIView *)view { return [BorrowhoodReservedRegionsView new]; }
RCT_EXPORT_VIEW_PROPERTY(onRegionsChange, RCTDirectEventBlock)
@end
